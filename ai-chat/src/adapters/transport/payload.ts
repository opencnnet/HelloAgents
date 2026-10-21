import type { TokenUsage } from '@/shared/types'

/** 安全读取字符串字段。 */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** 把事件负载中的对象/数组序列化为可展示文本。 */
export function stringifyValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 解析 OpenAI 风格 usage 对象。 */
export function toTokenUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const prompt = record.prompt_tokens
  const completion = record.completion_tokens
  const total = record.total_tokens
  if (typeof prompt !== 'number' && typeof completion !== 'number' && typeof total !== 'number') {
    return undefined
  }
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
    totalTokens: typeof total === 'number' ? total : undefined,
  }
}
