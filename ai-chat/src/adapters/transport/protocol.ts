import type { ChatSettings } from '@/shared/types'

import {
  createAnthropicDecoder,
  createHelloAgentsDecoder,
  createOpenAIDecoder,
  type ProtocolDecoder,
} from './decoders'
import { fromApiErrorPayload, parseError } from './errors'
import { toTokenUsage } from './payload'
import type { StreamCallbacks, WireMessage } from './types'

/** 去掉尾部斜杠，兼容用户直接粘贴完整的 /chat/completions 地址。 */
export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '')
}

export function chatCompletionsUrl(endpoint: string): string {
  const base = normalizeEndpoint(endpoint)
  if (/\/chat\/completions$/i.test(base)) return base
  return `${base}/chat/completions`
}

export function modelsUrl(endpoint: string): string {
  const base = chatCompletionsUrl(endpoint).replace(/\/chat\/completions$/i, '')
  return `${base}/models`
}

function anthropicBaseUrl(endpoint: string): string {
  return normalizeEndpoint(endpoint).replace(/\/v1(?:\/(?:messages|models))?$/i, '')
}

export function anthropicMessagesUrl(endpoint: string): string {
  return `${anthropicBaseUrl(endpoint)}/v1/messages`
}

export function anthropicModelsUrl(endpoint: string): string {
  return `${anthropicBaseUrl(endpoint)}/v1/models?limit=1000`
}

export function parseModelList(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    throw parseError()
  }
  const record = payload as Record<string, unknown>
  const data = Array.isArray(record.data) ? record.data : record.models
  if (!Array.isArray(data)) throw parseError()

  const models = data
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const model = item as Record<string, unknown>
      return typeof model.id === 'string'
        ? model.id.trim()
        : typeof model.name === 'string'
          ? model.name.trim()
          : typeof model.model === 'string'
            ? model.model.trim()
            : ''
    })
    .filter(Boolean)
  return [...new Set(models)]
}

export function agentStreamUrl(endpoint: string): string {
  const base = normalizeEndpoint(endpoint)
  if (/\/agent\/stream$/i.test(base)) return base
  return `${base}/agent/stream`
}

/** 技能管理接口与 /agent/stream 同源，复用同一代理。 */
export function agentSkillsUrl(endpoint: string): string {
  const base = normalizeEndpoint(endpoint)
  if (/\/agent\/skills$/i.test(base)) return base
  if (/\/agent\/stream$/i.test(base)) return base.replace(/\/stream$/i, '/skills')
  return `${base}/agent/skills`
}

/** 从接口地址提取主机名（用于状态栏展示）。 */
export function endpointHost(endpoint: string): string {
  const value = normalizeEndpoint(endpoint)
  if (!value) return '未配置地址'
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`)
    return url.host
  } catch {
    return value
  }
}

/** HelloAgents 模式下「模型」即 Agent 类型。 */
export function modelLabel(settings: ChatSettings): string {
  if (settings.apiType === 'helloagents') return settings.agentType
  return settings.model || '未配置模型'
}

export function authHeaders(settings: ChatSettings): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = settings.apiKey.trim()
  if (settings.apiType === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01'
    if (key) headers['x-api-key'] = key
    return headers
  }
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

export function probeHeaders(settings: ChatSettings): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = settings.apiKey.trim()
  if (settings.apiType === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01'
    if (key) headers['x-api-key'] = key
    return headers
  }
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

export function buildOpenAIBody(
  settings: ChatSettings,
  messages: WireMessage[],
  stream: boolean,
): Record<string, unknown> {
  return {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    top_p: settings.topP,
    max_tokens: settings.maxTokens,
    stream,
  }
}

export function buildAnthropicBody(
  settings: ChatSettings,
  messages: WireMessage[],
  stream: boolean,
): Record<string, unknown> {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    messages: messages
      .filter((message) => message.role !== 'system')
      .map(({ role, content }) => ({ role, content })),
    temperature: Math.min(settings.temperature, 1),
    top_p: settings.topP,
    stream,
  }
  if (system) body.system = system
  return body
}

export function buildHelloAgentsBody(
  settings: ChatSettings,
  input: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    input,
    agent_type: settings.agentType,
    mcp_servers: settings.mcpServers
      .filter((server) => server.enabled)
      .map((server) => ({
        name: server.name.trim() || '未命名 MCP',
        transport: server.transport,
        command: server.command.trim(),
        args: splitLines(server.args),
        url: server.url.trim(),
        prefix: server.prefix.trim(),
        tools: splitToolNames(server.tools),
        timeout: server.timeout,
      })),
  }
  const llm = buildAgentLlmPayload(settings)
  if (llm) body.llm = llm
  return body
}

/** 把「设置 → 模型」里的连接配置交给后端，让智能体使用同一个大模型。 */
function buildAgentLlmPayload(settings: ChatSettings): Record<string, string> | null {
  const model = settings.modelConnection
  if (!model.endpoint.trim() || !model.model.trim() || !model.apiKey.trim()) return null
  return {
    endpoint: model.endpoint.trim(),
    model: model.model.trim(),
    api_key: model.apiKey.trim(),
    provider: model.apiType,
  }
}

/** 每行一个参数/工具名，忽略空行。 */
function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** 工具白名单支持换行或逗号分隔。 */
function splitToolNames(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean)
}

export function createDecoder(
  apiType: ChatSettings['apiType'],
  callbacks: StreamCallbacks,
): ProtocolDecoder {
  if (apiType === 'helloagents') return createHelloAgentsDecoder(callbacks)
  if (apiType === 'anthropic') return createAnthropicDecoder(callbacks)
  return createOpenAIDecoder(callbacks)
}

/** 非流式 OpenAI 响应的统一处理（Web 与 Tauri 共用）。 */
export function applyOpenAINonStreamingPayload(
  payload: unknown,
  callbacks: StreamCallbacks,
): void {
  if (!payload || typeof payload !== 'object') {
    callbacks.onError?.(parseError())
    return
  }
  const record = payload as Record<string, unknown>
  if (record.error) {
    callbacks.onError?.(fromApiErrorPayload(record))
    return
  }
  const choices = record.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    callbacks.onError?.(parseError())
    return
  }
  const choice = choices[0] as Record<string, unknown>
  const message = choice.message as Record<string, unknown> | undefined
  const content = message && typeof message.content === 'string' ? message.content : ''
  if (content) callbacks.onDelta?.(content)
  const usage = toTokenUsage(record.usage)
  if (usage) callbacks.onUsage?.(usage)
  callbacks.onFinish?.({
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : 'stop',
  })
}

export function applyAnthropicNonStreamingPayload(
  payload: unknown,
  callbacks: StreamCallbacks,
): void {
  if (!payload || typeof payload !== 'object') {
    callbacks.onError?.(parseError())
    return
  }
  const record = payload as Record<string, unknown>
  if (record.type === 'error' || record.error) {
    callbacks.onError?.(fromApiErrorPayload(record))
    return
  }
  if (!Array.isArray(record.content)) {
    callbacks.onError?.(parseError())
    return
  }
  const text = record.content
    .filter((block): block is Record<string, unknown> => (
      typeof block === 'object' && block !== null
    ))
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
  if (text) callbacks.onDelta?.(text)

  if (record.usage && typeof record.usage === 'object') {
    const usage = record.usage as Record<string, unknown>
    const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined
    const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined
    if (inputTokens !== undefined || outputTokens !== undefined) {
      callbacks.onUsage?.({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens:
          inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined,
      })
    }
  }
  callbacks.onFinish?.({
    finishReason: typeof record.stop_reason === 'string' ? record.stop_reason : 'end_turn',
  })
}
