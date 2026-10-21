import type { ToolActivity } from '@/shared/types'

import { fromApiErrorPayload, makeError, parseError } from './errors'
import { readString, stringifyValue, toTokenUsage } from './payload'
import type { SseFrame } from './sse'
import type { FinishInfo, StreamCallbacks } from './types'

/** 与具体传输方式无关的协议解码器：喂入 SSE 帧，回调统一事件。 */
export interface ProtocolDecoder {
  push(frame: SseFrame): void
  end(): void
}

const DONE_SENTINEL = '[DONE]'

/** OpenAI 兼容协议的流式解码：choices[0].delta.content 增量 + [DONE] 结束。 */
export function createOpenAIDecoder(callbacks: StreamCallbacks): ProtocolDecoder {
  let finished = false
  let failed = false
  let sawContent = false
  let lastFinishReason: string | undefined

  const finish = (info: FinishInfo): void => {
    if (finished || failed) return
    finished = true
    callbacks.onFinish?.(info)
  }

  return {
    push(frame: SseFrame): void {
      if (finished || failed) return
      const data = frame.data.trim()
      if (!data) return
      if (data === DONE_SENTINEL) {
        finish({ finishReason: lastFinishReason ?? 'stop' })
        return
      }
      let payload: unknown
      try {
        payload = JSON.parse(data)
      } catch {
        failed = true
        callbacks.onError?.(parseError())
        return
      }
      if (!payload || typeof payload !== 'object') return
      const record = payload as Record<string, unknown>
      if (record.error) {
        failed = true
        callbacks.onError?.(fromApiErrorPayload(record))
        return
      }
      const usage = toTokenUsage(record.usage)
      if (usage) callbacks.onUsage?.(usage)

      const choices = record.choices
      if (!Array.isArray(choices) || choices.length === 0) return
      const choice = choices[0] as Record<string, unknown>
      const delta = choice.delta as Record<string, unknown> | undefined
      const message = choice.message as Record<string, unknown> | undefined
      const text = readString(delta?.content) ?? readString(message?.content)
      if (text) {
        sawContent = true
        callbacks.onDelta?.(text)
      }
      if (typeof choice.finish_reason === 'string') {
        lastFinishReason = choice.finish_reason
      }
    },
    end(): void {
      if (finished || failed) return
      finish({ finishReason: lastFinishReason ?? (sawContent ? 'stop' : undefined) })
    },
  }
}

export function createAnthropicDecoder(callbacks: StreamCallbacks): ProtocolDecoder {
  let finished = false
  let failed = false
  let stopReason: string | undefined
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  const reportUsage = (): void => {
    if (inputTokens === undefined && outputTokens === undefined) return
    callbacks.onUsage?.({
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens:
        inputTokens !== undefined && outputTokens !== undefined
          ? inputTokens + outputTokens
          : undefined,
    })
  }

  const finish = (reason?: string): void => {
    if (finished || failed) return
    finished = true
    callbacks.onFinish?.({ finishReason: reason ?? stopReason ?? 'end_turn' })
  }

  return {
    push(frame): void {
      if (finished || failed) return
      let payload: unknown
      try {
        payload = JSON.parse(frame.data)
      } catch {
        failed = true
        callbacks.onError?.(parseError())
        return
      }
      if (!payload || typeof payload !== 'object') return
      const record = payload as Record<string, unknown>
      const type = readString(record.type) ?? frame.event
      if (type === 'error' || record.error) {
        failed = true
        callbacks.onError?.(fromApiErrorPayload(record))
        return
      }
      if (type === 'message_start') {
        const message = record.message
        if (message && typeof message === 'object') {
          const usage = (message as Record<string, unknown>).usage
          if (usage && typeof usage === 'object') {
            const tokens = (usage as Record<string, unknown>).input_tokens
            if (typeof tokens === 'number') inputTokens = tokens
          }
        }
        reportUsage()
        return
      }
      if (type === 'content_block_delta') {
        const delta = record.delta
        if (delta && typeof delta === 'object') {
          const value = delta as Record<string, unknown>
          if (value.type === 'text_delta' && typeof value.text === 'string') {
            callbacks.onDelta?.(value.text)
          }
        }
        return
      }
      if (type === 'message_delta') {
        const delta = record.delta
        if (delta && typeof delta === 'object') {
          stopReason = readString((delta as Record<string, unknown>).stop_reason) ?? stopReason
        }
        const usage = record.usage
        if (usage && typeof usage === 'object') {
          const tokens = (usage as Record<string, unknown>).output_tokens
          if (typeof tokens === 'number') outputTokens = tokens
        }
        reportUsage()
        return
      }
      if (type === 'message_stop') finish()
    },
    end(): void {
      finish()
    },
  }
}

/** HelloAgents 流式事件协议：user 事件 + JSON 负载（type/timestamp/agent_name/data）。 */
export function createHelloAgentsDecoder(callbacks: StreamCallbacks): ProtocolDecoder {
  let finished = false
  let failed = false
  let activitySeq = 0
  let lastToolId: string | undefined

  const finish = (info: FinishInfo): void => {
    if (finished || failed) return
    finished = true
    callbacks.onFinish?.(info)
  }

  return {
    push(frame: SseFrame): void {
      if (finished || failed) return
      const data = frame.data.trim()
      if (!data) return
      if (data === DONE_SENTINEL) {
        finish({ finishReason: 'stop' })
        return
      }
      let payload: unknown
      try {
        payload = JSON.parse(data)
      } catch {
        failed = true
        callbacks.onError?.(parseError())
        return
      }
      if (!payload || typeof payload !== 'object') return
      const event = payload as Record<string, unknown>
      const type = readString(event.type) ?? frame.event
      const eventData = (
        event.data && typeof event.data === 'object' ? event.data : {}
      ) as Record<
        string,
        unknown
      >
      if (!type) return

      switch (type) {
        case 'agent_start': {
          // 开始信号由传输层在收到响应头时统一上报。
          break
        }
        case 'llm_chunk': {
          const chunk = readString(eventData.chunk)
          if (chunk) {
            callbacks.onDelta?.(chunk)
          }
          break
        }
        case 'tool_call_start': {
          const id = readString(eventData.id) ?? `tool-${++activitySeq}`
          lastToolId = id
          const activity: ToolActivity = {
            id,
            kind: 'tool',
            name: readString(eventData.name) ?? 'tool',
            status: 'running',
          }
          const args = stringifyValue(eventData.arguments)
          if (args !== undefined) activity.arguments = args
          if (typeof eventData.step === 'number') activity.step = eventData.step
          callbacks.onTool?.(activity)
          break
        }
        case 'tool_call_finish': {
          const id = readString(eventData.id) ?? lastToolId ?? `tool-${activitySeq}`
          const activity: ToolActivity = {
            id,
            kind: 'tool',
            name: readString(eventData.name) ?? 'tool',
            status: eventData.error ? 'error' : 'done',
          }
          const result = stringifyValue(eventData.result)
          if (result !== undefined) activity.result = result
          if (typeof eventData.step === 'number') activity.step = eventData.step
          callbacks.onTool?.(activity)
          break
        }
        case 'thinking': {
          const text = stringifyValue(
            eventData.text ??
              eventData.content ??
              eventData.message ??
              eventData.reasoning ??
              eventData,
          )
          callbacks.onTool?.({
            id: `thinking-${++activitySeq}`,
            kind: 'thinking',
            name: '思考过程',
            status: 'done',
            result: text ?? '',
          })
          break
        }
        case 'agent_finish': {
          const finalText = readString(eventData.result)
          const status = readString(eventData.status)
          const info: FinishInfo = {
            finishReason: readString(eventData.stop_reason) ?? 'stop',
          }
          if (finalText !== undefined) info.finalText = finalText
          if (status !== undefined) info.status = status
          finish(info)
          break
        }
        case 'error': {
          failed = true
          const message =
            readString(eventData.message) ??
            readString(eventData.error) ??
            stringifyValue(eventData.error) ??
            '服务端运行失败，请检查服务端配置与日志。'
          callbacks.onError?.(makeError('server', message))
          break
        }
        default:
          break
      }
    },
    end(): void {
      if (finished || failed) return
      finish({})
    },
  }
}
