/** 全局数据模型。所有模块共享这里的类型定义。 */

/** 接口类型：OpenAI 兼容 / Anthropic Messages / 本地模型 / HelloAgents Agent 服务 */
export type ApiType = 'openai' | 'anthropic' | 'local' | 'helloagents'
export type ModelApiType = Exclude<ApiType, 'helloagents'>

export interface ModelConnectionSettings {
  apiType: ModelApiType
  name: string
  endpoint: string
  apiKey: string
  model: string
}

export type ModelConnections = Record<ModelApiType, ModelConnectionSettings>

export interface AgentConnectionSettings {
  name: string
  endpoint: string
  apiKey: string
}

/** HelloAgents 服务的 Agent 类型 */
export type AgentType = 'simple' | 'react' | 'reflection' | 'plan'

export type MCPTransport = 'stdio' | 'streamable-http'

export interface MCPServerSettings {
  name: string
  enabled: boolean
  transport: MCPTransport
  command: string
  args: string
  url: string
  prefix: string
  tools: string
  timeout: number
}

export type MessageRole = 'user' | 'assistant' | 'system'

/** 等待首包前为 pending，流式生成中为 streaming，结束后 done / error。 */
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error'

/** 统一错误分类，界面据此展示中文提示。 */
export type ErrorKind =
  | 'network'
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'parser'
  | 'aborted'
  | 'config'
  | 'unknown'

export interface ChatError {
  kind: ErrorKind
  message: string
  status?: number
}

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/** 工具事件：HelloAgents 模式下 tool_call_start / tool_call_finish / thinking 的展示形态。 */
export interface ToolActivity {
  id: string
  kind: 'tool' | 'thinking'
  name: string
  status: 'running' | 'done' | 'error'
  arguments?: string
  result?: string
  step?: number
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  status: MessageStatus
  /** 失败时的错误信息；用户主动停止时 kind 为 aborted 且 status 仍为 done。 */
  error?: ChatError | null
  usage?: TokenUsage | null
  activities?: ToolActivity[]
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  /** 创建会话时的模型快照（HelloAgents 模式记录 agent 类型）。 */
  modelSnapshot: string
}

export interface ChatSettings {
  endpoint: string
  apiKey: string
  apiType: ApiType
  model: string
  temperature: number
  topP: number
  maxTokens: number
  contextTurns: number
  systemPrompt: string
  streaming: boolean
  /** 仅 helloagents 接口使用 */
  agentType: AgentType
  /** 当前选中并生效的模型连接配置。 */
  modelConnection: ModelConnectionSettings
  /** 按服务类型分别保存的模型连接配置。 */
  modelConnections: ModelConnections
  agentConnection: AgentConnectionSettings
  /** MCP 服务配置；当前仅保存于本机，尚未由 Agent 服务加载。 */
  mcpServers: MCPServerSettings[]
}

export type Theme = 'light' | 'dark'

/** 连接状态机：未配置 → 未检测 → 检测中 → 已连接 / 错误 */
export type ConnectionPhase = 'unconfigured' | 'unchecked' | 'checking' | 'connected' | 'error'

export interface ConnectionInfo {
  phase: ConnectionPhase
  /** 已连接时展示的主机（如 api.deepseek.com） */
  host?: string
  /** 已连接时展示的模型（HelloAgents 模式为 agent 类型） */
  model?: string
  latencyMs?: number
  error?: ChatError
}
