/**
 * 内置默认配置（首次启动兜底）。
 * 配置优先级：UI 内保存的设置 > 环境变量 / 本文件 > 代码内置兜底。
 * 这里不允许出现任何密钥。
 */
import type {
  AgentType,
  AgentConnectionSettings,
  ApiType,
  ChatSettings,
  MCPServerSettings,
  MCPTransport,
  ModelApiType,
  ModelConnectionSettings,
  ModelConnections,
} from '@/shared/types'
import { isTauri } from '@/adapters/env'

export const APP_NAME = 'HelloAgents 对话'
export const DEFAULT_TITLE = '新对话'
export const MAX_MESSAGE_LENGTH = 4000
export const COMPOSER_MAX_HEIGHT = 168

/** 统一存储键名前缀；会话与设置使用不同的键。 */
export const STORAGE_PREFIX = 'helloagents.chat'
export const STORAGE_KEYS = {
  conversations: `${STORAGE_PREFIX}.conversations`,
  activeConversation: `${STORAGE_PREFIX}.active-conversation`,
  settings: `${STORAGE_PREFIX}.settings`,
  theme: `${STORAGE_PREFIX}.theme`,
  sidebarCollapsed: `${STORAGE_PREFIX}.sidebar-collapsed`,
} as const

export const API_TYPES: readonly ApiType[] = [
  'openai',
  'anthropic',
  'local',
  'helloagents',
]
export const MODEL_API_TYPES: readonly ModelApiType[] = ['openai', 'anthropic', 'local']
export const AGENT_TYPES: readonly AgentType[] = ['simple', 'react', 'reflection', 'plan']

export const API_TYPE_LABELS: Record<ApiType, string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic 兼容',
  local: '本地模型',
  helloagents: '智能体服务',
}

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  simple: 'simple · 简单对话',
  react: 'react · 工具循环',
  reflection: 'reflection · 反思改进',
  plan: 'plan · 规划求解',
}

export const AGENT_TYPE_NAMES: Record<AgentType, string> = {
  simple: '简单对话',
  react: '工具循环',
  reflection: '反思改进',
  plan: '规划求解',
}

/** 仅用于输入框占位提示，不会自动写入设置。 */
export const ENDPOINT_PLACEHOLDERS: Record<ApiType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  local: 'http://127.0.0.1:11434/v1',
  helloagents: 'http://127.0.0.1:8000',
}

const CODE_DEFAULTS: ChatSettings = {
  endpoint: '',
  apiKey: '',
  apiType: 'openai',
  model: '',
  temperature: 0.7,
  topP: 1,
  maxTokens: 2048,
  contextTurns: 10,
  systemPrompt: '',
  streaming: true,
  agentType: 'simple',
  modelConnection: {
    apiType: 'openai',
    name: 'OpenAI 兼容',
    endpoint: '',
    apiKey: '',
    model: '',
  },
  modelConnections: {
    openai: { apiType: 'openai', name: 'OpenAI 兼容', endpoint: '', apiKey: '', model: '' },
    anthropic: {
      apiType: 'anthropic',
      name: 'Anthropic 兼容',
      endpoint: '',
      apiKey: '',
      model: '',
    },
    local: { apiType: 'local', name: '本地模型', endpoint: '', apiKey: '', model: '' },
  },
  agentConnection: {
    name: '本地智能体',
    endpoint: '',
    apiKey: '',
  },
  mcpServers: [],
}

function pickEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function sanitizeMcpServers(value: unknown): MCPServerSettings[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((server): server is Record<string, unknown> => (
      typeof server === 'object' && server !== null && !Array.isArray(server)
    ))
    .map((server) => ({
      name: typeof server.name === 'string' ? server.name.trim() : '',
      enabled: server.enabled !== false,
      transport: pickEnum<MCPTransport>(
        server.transport,
        ['stdio', 'streamable-http'],
        'stdio',
      ),
      command: typeof server.command === 'string' ? server.command.trim() : '',
      args: typeof server.args === 'string' ? server.args : '',
      url: typeof server.url === 'string' ? server.url.trim() : '',
      prefix: typeof server.prefix === 'string' ? server.prefix.trim() : '',
      tools: typeof server.tools === 'string' ? server.tools : '',
      timeout: clampNumber(server.timeout, 1, 300, 30),
    }))
}

function sanitizeModelConnection(
  value: unknown,
  legacy: Partial<ChatSettings>,
): ModelConnectionSettings {
  const profile = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null
  const source: Record<string, unknown> = profile ?? (
    legacy.apiType !== 'helloagents'
      ? {
          apiType: legacy.apiType,
          name: legacy.modelConnection?.name,
          endpoint: legacy.endpoint,
          apiKey: legacy.apiKey,
          model: legacy.model,
        }
      : {}
  )
  const apiType = pickEnum<ModelApiType>(
    source.apiType,
    MODEL_API_TYPES as readonly ModelApiType[],
    'openai',
  )
  return {
    apiType,
    name:
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim().slice(0, 80)
        : API_TYPE_LABELS[apiType],
    endpoint: typeof source.endpoint === 'string' ? source.endpoint.trim() : '',
    apiKey: sanitizeSecret(source.apiKey),
    model: typeof source.model === 'string' ? source.model.trim() : '',
  }
}

function sanitizeModelConnections(
  value: unknown,
  legacy: Partial<ChatSettings>,
): ModelConnections {
  const profiles = typeof value === 'object' && value !== null
    ? value as Partial<Record<ModelApiType, unknown>>
    : {}
  const legacyProfile = sanitizeModelConnection(legacy.modelConnection, legacy)
  const result = {} as ModelConnections
  for (const apiType of MODEL_API_TYPES) {
    const source = profiles[apiType]
    const fallback = legacyProfile.apiType === apiType
      ? legacyProfile
      : CODE_DEFAULTS.modelConnections[apiType]
    result[apiType] = sanitizeModelConnection(source ?? fallback, { ...legacy, apiType })
  }
  return result
}

function sanitizeAgentConnection(
  value: unknown,
  legacy: Partial<ChatSettings>,
): AgentConnectionSettings {
  const profile = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null
  const source: Record<string, unknown> = profile ?? (
    legacy.apiType === 'helloagents'
      ? {
          name: legacy.agentConnection?.name,
          endpoint: legacy.endpoint,
          apiKey: legacy.apiKey,
        }
      : {}
  )
  return {
    name:
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim().slice(0, 80)
        : '本地智能体',
    endpoint: typeof source.endpoint === 'string' ? source.endpoint.trim() : '',
    apiKey: sanitizeSecret(source.apiKey),
  }
}

/** 密钥里混入空格/换行会让 fetch 直接抛 TypeError，这里统一剔除不可见字符。 */
function sanitizeSecret(value: unknown): string {
  if (typeof value !== 'string') return ''
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code > 32 && code !== 127
    })
    .join('')
}

/** 清洗任意来源（存储 / 表单 / 环境变量）的设置，保证字段合法。 */
export function sanitizeSettings(raw: Partial<ChatSettings> | null | undefined): ChatSettings {
  const merged = { ...CODE_DEFAULTS, ...(raw ?? {}) }
  const modelConnections = sanitizeModelConnections(raw?.modelConnections, raw ?? {})
  const selectedModelApiType = pickEnum<ModelApiType>(
    raw?.modelConnection?.apiType ?? raw?.apiType,
    MODEL_API_TYPES,
    CODE_DEFAULTS.modelConnection.apiType,
  )
  const apiType = pickEnum(merged.apiType, API_TYPES, CODE_DEFAULTS.apiType)
  const agentConnection = sanitizeAgentConnection(raw?.agentConnection, raw ?? {})
  // 智能体模式下顶层地址/密钥始终以智能体连接为准，避免历史设置里残留模型地址。
  const useAgent = apiType === 'helloagents'
  return {
    endpoint: useAgent
      ? agentConnection.endpoint
      : typeof merged.endpoint === 'string'
        ? merged.endpoint.trim()
        : '',
    apiKey: useAgent
      ? agentConnection.apiKey
      : sanitizeSecret(merged.apiKey),
    apiType,
    model: typeof merged.model === 'string' ? merged.model.trim() : '',
    temperature: clampNumber(merged.temperature, 0, 2, CODE_DEFAULTS.temperature),
    topP: clampNumber(merged.topP, 0, 1, CODE_DEFAULTS.topP),
    maxTokens: Math.round(clampNumber(merged.maxTokens, 1, 131072, CODE_DEFAULTS.maxTokens)),
    contextTurns: Math.round(clampNumber(merged.contextTurns, 0, 50, CODE_DEFAULTS.contextTurns)),
    systemPrompt: typeof merged.systemPrompt === 'string' ? merged.systemPrompt : '',
    streaming: merged.streaming !== false,
    agentType: pickEnum(merged.agentType, AGENT_TYPES, CODE_DEFAULTS.agentType),
    modelConnection: modelConnections[selectedModelApiType],
    modelConnections,
    agentConnection,
    mcpServers: sanitizeMcpServers(merged.mcpServers),
  }
}

/** 环境变量与代码兜底值的合并结果，供首次启动与「恢复默认」使用。 */
export function resolveDefaultSettings(): ChatSettings {
  const env = import.meta.env

  // 本地联调开关：打开即默认使用 HelloAgents 模式。
  // Web 端使用页面同源地址（走 Vite 的 /agent 代理），桌面端直连本地 8000。
  if (env.VITE_AUTO_CONNECT_HELLOAGENTS === '1') {
    const endpoint = isTauri
      ? ENDPOINT_PLACEHOLDERS.helloagents
      : typeof window !== 'undefined'
        ? window.location.origin
        : ''
    return sanitizeSettings({
      ...CODE_DEFAULTS,
      apiType: 'helloagents',
      endpoint,
      agentConnection: { name: '本地智能体', endpoint, apiKey: '' },
    })
  }

  const apiType = pickEnum(env.VITE_DEFAULT_API_TYPE, API_TYPES, CODE_DEFAULTS.apiType)
  const endpoint = env.VITE_DEFAULT_API_ENDPOINT ?? ''
  const model = env.VITE_DEFAULT_MODEL ?? ''
  const modelConnection: ModelConnectionSettings = apiType === 'helloagents'
    ? CODE_DEFAULTS.modelConnection
    : {
        apiType,
        name: API_TYPE_LABELS[apiType],
        endpoint,
        apiKey: '',
        model,
      }
  const modelConnections = {
    ...CODE_DEFAULTS.modelConnections,
    [modelConnection.apiType]: modelConnection,
  }
  return sanitizeSettings({
    ...CODE_DEFAULTS,
    apiType,
    endpoint,
    model,
    modelConnection,
    modelConnections,
    agentConnection:
      apiType === 'helloagents'
        ? { name: '本地智能体', endpoint, apiKey: '' }
        : CODE_DEFAULTS.agentConnection,
  })
}

/** 是否已经具备发起请求的最低配置。 */
export function isSettingsConfigured(settings: ChatSettings): boolean {
  if (!settings.endpoint.trim()) return false
  if (settings.apiType === 'helloagents') return true
  return settings.model.trim().length > 0
}
