import type { ChatError, ChatSettings } from '@/shared/types'
import { createId } from '@/shared/utils/id'

import {
  abortedError,
  isChatError,
  makeError,
  mapHttpStatus,
  networkError,
  parseError,
} from './errors'
import {
  agentStreamUrl,
  anthropicMessagesUrl,
  anthropicModelsUrl,
  applyAnthropicNonStreamingPayload,
  applyOpenAINonStreamingPayload,
  authHeaders,
  buildAnthropicBody,
  buildHelloAgentsBody,
  buildOpenAIBody,
  chatCompletionsUrl,
  createDecoder,
  endpointHost,
  modelsUrl,
  parseModelList,
  probeHeaders,
} from './protocol'
import { parseSseBuffer } from './sse'
import type { ChatRequest, ChatTransport, ProbeResult, StreamCallbacks } from './types'

interface StreamEventPayload {
  requestId: string
  kind: 'start' | 'chunk' | 'done' | 'error'
  chunk?: string
  status?: number
  message?: string
}

interface ChatCommandPayload {
  requestId: string
  url: string
  headers: Record<string, string>
  body: string
}

interface ProbeCommandPayload {
  url: string
  headers: Record<string, string>
}

interface ProbeResponse {
  status: number
  latencyMs: number
  message?: string
}

async function invokeCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

async function listenStream(
  handler: (payload: StreamEventPayload) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  return listen<StreamEventPayload>('chat-stream', (event) => handler(event.payload))
}

/** Rust 侧的错误以字符串 reject，保留原始提示而不是一律当作网络错误。 */
function toTauriError(err: unknown): ChatError {
  if (isChatError(err)) return err
  if (typeof err === 'string' && err.trim()) return makeError('network', err.trim())
  if (err instanceof Error && err.message) return makeError('unknown', err.message)
  return networkError()
}

/**
 * Tauri 实现：Rust 侧发起 HTTP 请求，通过事件推送原始文本片段；
 * 协议解析复用与 Web 相同的纯函数，保证两端行为一致。
 */
export function createTauriTransport(): ChatTransport {
  return {
    kind: 'tauri',

    async streamChat(
      request: ChatRequest,
      callbacks: StreamCallbacks,
      signal: AbortSignal,
    ): Promise<void> {
      const { settings } = request
      const isAgent = settings.apiType === 'helloagents'
      const streaming = isAgent || settings.streaming
      const requestId = createId()
      const decoder = streaming ? createDecoder(settings.apiType, callbacks) : null
      const body = isAgent
        ? buildHelloAgentsBody(settings, request.agentInput)
        : settings.apiType === 'anthropic'
          ? buildAnthropicBody(settings, request.messages, settings.streaming)
        : buildOpenAIBody(settings, request.messages, settings.streaming)
      const payload: ChatCommandPayload = {
        requestId,
        url: isAgent
          ? agentStreamUrl(settings.endpoint)
          : settings.apiType === 'anthropic'
            ? anthropicMessagesUrl(settings.endpoint)
            : chatCompletionsUrl(settings.endpoint),
        headers: authHeaders(settings),
        body: JSON.stringify(body),
      }

      let buffer = ''
      let settled = false
      let started = false
      let resolveCompletion: () => void = () => undefined
      const completion = new Promise<void>((resolve) => {
        resolveCompletion = resolve
      })
      const settle = (): void => {
        if (settled) return
        settled = true
        resolveCompletion()
      }
      const ensureStarted = (): void => {
        if (started) return
        started = true
        callbacks.onStart?.()
      }

      let unlisten: (() => void) | null = null
      const abortHandler = (): void => {
        if (settled) return
        void invokeCommand('chat_cancel', { requestId }).catch(() => undefined)
        callbacks.onError?.(abortedError())
        settle()
      }

      try {
        unlisten = await listenStream((event) => {
          if (event.requestId !== requestId || settled) return
          if (event.kind === 'start') {
            ensureStarted()
            return
          }
          if (event.kind === 'chunk') {
            ensureStarted()
            buffer += event.chunk ?? ''
            if (decoder) {
              const { frames, rest } = parseSseBuffer(buffer)
              buffer = rest
              for (const frame of frames) decoder.push(frame)
            }
            return
          }
          if (event.kind === 'done') {
            ensureStarted()
            if (decoder) {
              const tail = parseSseBuffer(buffer, true)
              for (const frame of tail.frames) decoder.push(frame)
              decoder.end()
            } else {
              try {
                const parsed: unknown = JSON.parse(buffer.trim())
                if (settings.apiType === 'anthropic') {
                  applyAnthropicNonStreamingPayload(parsed, callbacks)
                } else {
                  applyOpenAINonStreamingPayload(parsed, callbacks)
                }
              } catch {
                callbacks.onError?.(parseError())
              }
            }
            settle()
            return
          }
          // 服务端/网络错误
          if (event.status !== undefined) {
            const base = mapHttpStatus(event.status)
            callbacks.onError?.(
              makeError(
                base.kind,
                event.message ? `${base.message} ${event.message}` : base.message,
                event.status,
              ),
            )
          } else {
            callbacks.onError?.(makeError('network', event.message || '网络请求失败，请检查接口地址与网络。'))
          }
          settle()
        })

        signal.addEventListener('abort', abortHandler, { once: true })
        if (signal.aborted) {
          abortHandler()
          await completion
          return
        }

        try {
          await invokeCommand('chat_stream', { request: payload })
        } catch (err) {
          callbacks.onError?.(toTauriError(err))
          settle()
        }
        await completion
      } finally {
        signal.removeEventListener('abort', abortHandler)
        try {
          unlisten?.()
        } catch {
          // 监听器已释放。
        }
      }
    },

    async testConnection(settings: ChatSettings): Promise<ProbeResult> {
      const isAgent = settings.apiType === 'helloagents'
      const probe: ProbeCommandPayload = {
        url: isAgent
          ? agentStreamUrl(settings.endpoint)
          : settings.apiType === 'anthropic'
            ? anthropicModelsUrl(settings.endpoint)
            : modelsUrl(settings.endpoint),
        headers: isAgent
          ? { ...probeHeaders(settings), Accept: 'application/json' }
          : probeHeaders(settings),
      }
      let result: ProbeResponse
      try {
        result = await invokeCommand<ProbeResponse>('probe_connection', { request: probe })
      } catch (err) {
        throw toTauriError(err)
      }
      const reachable =
        (result.status >= 200 && result.status < 300) ||
        // FastAPI 对 GET /agent/stream 返回 405，说明服务在线。
        (isAgent && result.status === 405)
      if (!reachable) {
        const base = mapHttpStatus(result.status)
        throw makeError(
          base.kind,
          result.message ? `${base.message} ${result.message}` : base.message,
          result.status,
        )
      }
      return {
        status: result.status,
        latencyMs: result.latencyMs,
        host: endpointHost(settings.endpoint),
        model: isAgent ? settings.agentType : settings.model,
      }
    },

    async listModels(settings: ChatSettings): Promise<string[]> {
      let payload: string
      try {
        payload = await invokeCommand<string>('list_models', {
          request: {
            url: settings.apiType === 'anthropic'
              ? anthropicModelsUrl(settings.endpoint)
              : modelsUrl(settings.endpoint),
            headers: probeHeaders(settings),
          },
        })
      } catch (err) {
        throw toTauriError(err)
      }
      try {
        return parseModelList(JSON.parse(payload) as unknown)
      } catch (err) {
        if (isChatError(err)) throw err
        throw parseError()
      }
    },
  }
}
