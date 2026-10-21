import type { ChatSettings, ToolActivity } from '@/shared/types'

import { abortedError } from './errors'
import { endpointHost } from './protocol'
import type { ChatTransport, ProbeResult } from './types'

const MOCK_REPLY = `这是离线模拟回复，用于在没有后端时检查界面与流式渲染。

- 逐段出现的内容由 mock 传输生成
- 代码块、表格与列表都来自同一条 Markdown 文本
- 配置真实接口后即可关闭模拟模式`

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function lastUserText(texts: { role: string; content: string }[]): string {
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    if (texts[i].role === 'user') return texts[i].content
  }
  return ''
}

/** 离线模拟传输：不发起任何网络请求，用于开发调试（VITE_TRANSPORT=mock）。 */
export function createMockTransport(): ChatTransport {
  return {
    kind: 'mock',

    async streamChat(request, callbacks, signal): Promise<void> {
      const isAgent = request.settings.apiType === 'helloagents'
      callbacks.onStart?.()

      if (isAgent) {
        const tool: ToolActivity = {
          id: 'mock-tool',
          kind: 'tool',
          name: 'calculator',
          status: 'running',
          arguments: '{"expression":"(320 + 80) * 2"}',
          step: 1,
        }
        callbacks.onTool?.(tool)
        await sleep(280)
        if (signal.aborted) {
          callbacks.onError?.(abortedError())
          return
        }
        callbacks.onTool?.({ ...tool, status: 'done', result: '800' })
      }

      const prompt = isAgent ? request.agentInput : lastUserText(request.messages)
      const text = `${MOCK_REPLY}\n\n收到：${prompt}`
      for (let index = 0; index < text.length; ) {
        if (signal.aborted) {
          callbacks.onError?.(abortedError())
          return
        }
        const size = 2 + Math.floor(Math.random() * 4)
        callbacks.onDelta?.(text.slice(index, index + size))
        index += size
        await sleep(24)
      }
      callbacks.onFinish?.(
        isAgent ? { finishReason: 'stop', finalText: text } : { finishReason: 'stop' },
      )
    },

    async testConnection(settings: ChatSettings): Promise<ProbeResult> {
      await sleep(260)
      return {
        status: 200,
        latencyMs: 260,
        host: endpointHost(settings.endpoint) || 'mock.local',
        model: settings.apiType === 'helloagents' ? settings.agentType : settings.model || 'mock',
      }
    },

    async listModels(): Promise<string[]> {
      await sleep(200)
      return ['mock-model']
    },
  }
}
