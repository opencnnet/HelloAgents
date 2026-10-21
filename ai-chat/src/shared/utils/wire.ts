import type { WireMessage } from '@/adapters/transport'
import type { ChatMessage, ChatSettings } from '@/shared/types'

interface ContextSplit {
  /** 当前输入之前的可裁剪历史（不含系统消息、失败或空回复）。 */
  prior: ChatMessage[]
  /** 当前用户消息（最后一条用户输入）。 */
  current?: ChatMessage
}

function usableMessages(history: ChatMessage[]): ChatMessage[] {
  return history.filter(
    (message) =>
      message.role !== 'system' &&
      message.content.trim().length > 0 &&
      (message.role === 'user' || message.status === 'done'),
  )
}

/** 从历史中找到最后一条用户消息作为当前输入，其余按上下文轮数裁剪。 */
export function splitContext(history: ChatMessage[], contextTurns: number): ContextSplit {
  const usable = usableMessages(history)
  let currentIndex = -1
  for (let i = usable.length - 1; i >= 0; i -= 1) {
    if (usable[i].role === 'user') {
      currentIndex = i
      break
    }
  }
  const current = currentIndex >= 0 ? usable[currentIndex] : undefined
  const priorHistory = currentIndex >= 0 ? usable.slice(0, currentIndex) : usable
  const maxMessages = Math.max(0, contextTurns) * 2
  const prior = maxMessages > 0 ? priorHistory.slice(-maxMessages) : []
  return current ? { prior, current } : { prior }
}

/** 构造 OpenAI 兼容请求的 messages（含系统提示词）。 */
export function buildOpenAIMessages(
  settings: ChatSettings,
  history: ChatMessage[],
): WireMessage[] {
  const messages: WireMessage[] = []
  if (settings.systemPrompt.trim()) {
    messages.push({ role: 'system', content: settings.systemPrompt.trim() })
  }
  const { prior, current } = splitContext(history, settings.contextTurns)
  for (const message of prior) {
    messages.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })
  }
  if (current) {
    messages.push({ role: 'user', content: current.content })
  }
  return messages
}

/**
 * HelloAgents 的 /agent/stream 是单轮输入接口；
 * 将最近若干轮对话转录进 input，保证多轮体验不丢上下文。
 * 历史会按单条长度与总预算裁剪，避免超过服务端上限（HTTP 422）。
 */
const AGENT_INPUT_LIMIT = 20000
const AGENT_MESSAGE_LIMIT = 4000

function clipMessage(text: string, limit: number): string {
  const trimmed = text.trim()
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…（已截断）`
}

export function buildAgentInput(settings: ChatSettings, history: ChatMessage[]): string {
  const { prior, current } = splitContext(history, settings.contextTurns)
  if (!current) return ''
  if (prior.length === 0) return current.content

  const header = '以下是此前的对话记录，供你参考：\n\n'
  const tail = `\n\n用户：${current.content}`
  let budget = AGENT_INPUT_LIMIT - header.length - tail.length
  const lines: string[] = []
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    const message = prior[index]
    if (!message) continue
    const role = message.role === 'user' ? '用户' : '助手'
    const line = `${role}：${clipMessage(message.content, AGENT_MESSAGE_LIMIT)}`
    if (line.length + 2 > budget) continue
    lines.unshift(line)
    budget -= line.length + 2
  }
  if (lines.length === 0) return current.content
  return `${header}${lines.join('\n\n')}${tail}`
}
