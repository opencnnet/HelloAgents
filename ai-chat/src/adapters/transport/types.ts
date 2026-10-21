import type { ChatError, ChatSettings, TokenUsage, ToolActivity } from '@/shared/types'

/** OpenAI 协议的消息结构（也是上下文裁剪后的产物）。 */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  settings: ChatSettings
  /** OpenAI 兼容模式的 messages（含系统提示词与裁剪后的上下文）。 */
  messages: WireMessage[]
  /** HelloAgents 模式的单轮输入（已把最近对话转录进文本）。 */
  agentInput: string
}

export interface FinishInfo {
  /** HelloAgents 模式下 agent_finish.data.result 的终稿；有值时替换草稿内容。 */
  finalText?: string
  finishReason?: string
  /** HelloAgents 的结束状态：completed / max_iterations / output_limit 等。 */
  status?: string
}

export interface StreamCallbacks {
  onStart?: () => void
  onDelta?: (text: string) => void
  onTool?: (activity: ToolActivity) => void
  onUsage?: (usage: TokenUsage) => void
  onFinish?: (info: FinishInfo) => void
  onError?: (error: ChatError) => void
}

export interface ProbeResult {
  status: number
  latencyMs: number
  host: string
  model?: string
}

/** 请求适配器统一接口：流式对话 + 连接探测。 */
export interface ChatTransport {
  readonly kind: 'web' | 'tauri' | 'mock'
  streamChat(
    request: ChatRequest,
    callbacks: StreamCallbacks,
    signal: AbortSignal,
  ): Promise<void>
  testConnection(settings: ChatSettings): Promise<ProbeResult>
  listModels(settings: ChatSettings): Promise<string[]>
}
