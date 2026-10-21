import type { ChatSettings } from '@/shared/types'

import {
  abortedError,
  isAbortError,
  isChatError,
  makeError,
  mapHttpStatus,
  networkError,
  parseError,
  readErrorBody,
  timeoutError,
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

const PROBE_TIMEOUT_MS = 10_000

interface ProbeFetchResult {
  response: Response
  latencyMs: number
}

async function probeFetch(url: string, headers: Record<string, string>): Promise<ProbeFetchResult> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const started = performance.now()
  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    return { response, latencyMs: Math.round(performance.now() - started) }
  } catch (err) {
    if (isAbortError(err)) throw timeoutError()
    // 浏览器抛出的 TypeError 通常意味着地址非法、跨域被拦或请求头非法，保留原因便于定位。
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    throw makeError('network', `无法连接到服务器（${detail}）`)
  } finally {
    window.clearTimeout(timer)
  }
}

async function consumeSse(
  response: Response,
  settings: ChatSettings,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError?.(parseError())
    return
  }
  const decoder = createDecoder(settings.apiType, callbacks)
  const textDecoder = new TextDecoder('utf-8')
  let buffer = ''
  let aborted = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += textDecoder.decode(value, { stream: true })
      const { frames, rest } = parseSseBuffer(buffer)
      buffer = rest
      for (const frame of frames) decoder.push(frame)
      if (signal.aborted) {
        aborted = true
        break
      }
    }
    if (!aborted) {
      buffer += textDecoder.decode()
      const tail = parseSseBuffer(buffer, true)
      for (const frame of tail.frames) decoder.push(frame)
      decoder.end()
    }
  } catch (err) {
    if (isAbortError(err) || signal.aborted) aborted = true
    else callbacks.onError?.(networkError())
  } finally {
    try {
      await reader.cancel()
    } catch {
      // 流已经关闭。
    }
  }
  if (aborted) callbacks.onError?.(abortedError())
}

function buildStreamRequest(request: ChatRequest): {
  url: string
  body: Record<string, unknown>
} {
  const { settings } = request
  if (settings.apiType === 'helloagents') {
    return {
      url: agentStreamUrl(settings.endpoint),
      body: buildHelloAgentsBody(settings, request.agentInput),
    }
  }
  if (settings.apiType === 'anthropic') {
    return {
      url: anthropicMessagesUrl(settings.endpoint),
      body: buildAnthropicBody(settings, request.messages, settings.streaming),
    }
  }
  return {
    url: chatCompletionsUrl(settings.endpoint),
    body: buildOpenAIBody(settings, request.messages, settings.streaming),
  }
}

/** 浏览器实现：fetch + 流式读取响应体，按 SSE 帧边界解析。 */
export function createWebTransport(): ChatTransport {
  return {
    kind: 'web',

    async streamChat(
      request: ChatRequest,
      callbacks: StreamCallbacks,
      signal: AbortSignal,
    ): Promise<void> {
      const { settings } = request
      const isAgent = settings.apiType === 'helloagents'
      const streaming = isAgent || settings.streaming
      const { url, body } = buildStreamRequest(request)

      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: authHeaders(settings),
          body: JSON.stringify(body),
          signal,
        })
      } catch (err) {
        if (isAbortError(err) || signal.aborted) callbacks.onError?.(abortedError())
        else callbacks.onError?.(networkError())
        return
      }

      if (!response.ok) {
        const status = response.status
        const detail = await readErrorBody(response)
        const base = mapHttpStatus(status)
        callbacks.onError?.(
          detail ? makeError(base.kind, `${base.message} ${detail}`, status) : base,
        )
        return
      }

      callbacks.onStart?.()

      if (!streaming) {
        try {
          const payload: unknown = await response.json()
          if (settings.apiType === 'anthropic') {
            applyAnthropicNonStreamingPayload(payload, callbacks)
          } else {
            applyOpenAINonStreamingPayload(payload, callbacks)
          }
        } catch (err) {
          if (isAbortError(err) || signal.aborted) callbacks.onError?.(abortedError())
          else callbacks.onError?.(parseError())
        }
        return
      }

      await consumeSse(response, settings, callbacks, signal)
    },

    async testConnection(settings: ChatSettings): Promise<ProbeResult> {
      if (settings.apiType === 'helloagents') {
        const headers = { ...probeHeaders(settings), Accept: 'application/json' }
        const { response, latencyMs } = await probeFetch(
          agentStreamUrl(settings.endpoint),
          headers,
        )
        // FastAPI 对 GET /agent/stream 返回 405，说明服务在线、路由存在。
        if (!response.ok && response.status !== 405) {
          const detail = await readErrorBody(response)
          const base = mapHttpStatus(response.status)
          throw makeError(
            base.kind,
            detail ? `${base.message} ${detail}` : base.message,
            response.status,
          )
        }
        return {
          status: response.status,
          latencyMs,
          host: endpointHost(settings.endpoint),
          model: settings.agentType,
        }
      }

      const { response, latencyMs } = await probeFetch(
        settings.apiType === 'anthropic'
          ? anthropicModelsUrl(settings.endpoint)
          : modelsUrl(settings.endpoint),
        probeHeaders(settings),
      )
      if (!response.ok) {
        const detail = await readErrorBody(response)
        const base = mapHttpStatus(response.status)
        throw makeError(
          base.kind,
          detail ? `${base.message} ${detail}` : base.message,
          response.status,
        )
      }
      return {
        status: response.status,
        latencyMs,
        host: endpointHost(settings.endpoint),
        model: settings.model,
      }
    },

    async listModels(settings: ChatSettings): Promise<string[]> {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      try {
        const response = await fetch(
          settings.apiType === 'anthropic'
            ? anthropicModelsUrl(settings.endpoint)
            : modelsUrl(settings.endpoint),
          {
            method: 'GET',
            headers: probeHeaders(settings),
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          const detail = await readErrorBody(response)
          const base = mapHttpStatus(response.status)
          throw makeError(
            base.kind,
            detail ? `${base.message} ${detail}` : base.message,
            response.status,
          )
        }
        try {
          return parseModelList(await response.json())
        } catch (err) {
          if (isChatError(err)) throw err
          throw parseError()
        }
      } catch (err) {
        if (isAbortError(err)) throw timeoutError()
        if (isChatError(err)) throw err
        throw networkError()
      } finally {
        window.clearTimeout(timer)
      }
    },
  }
}
