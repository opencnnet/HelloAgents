import type { ChatError, ErrorKind } from '@/shared/types'

export function makeError(kind: ErrorKind, message: string, status?: number): ChatError {
  return status === undefined ? { kind, message } : { kind, message, status }
}

export function isChatError(value: unknown): value is ChatError {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.kind === 'string' && typeof record.message === 'string'
}

export function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

export function mapHttpStatus(status: number): ChatError {
  if (status === 401 || status === 403) {
    return makeError('auth', '鉴权失败，请检查 API Key 或访问权限。', status)
  }
  if (status === 404) {
    return makeError('server', '接口地址不存在（HTTP 404），请检查接口地址。', status)
  }
  if (status === 408 || status === 504) {
    return makeError('server', '服务端响应超时，请稍后再试。', status)
  }
  if (status === 429) {
    return makeError('rate-limit', '请求过于频繁或额度不足（HTTP 429），请稍后再试。', status)
  }
  if (status >= 500) {
    return makeError('server', `服务端返回错误（HTTP ${status}）。`, status)
  }
  return makeError('unknown', `请求失败（HTTP ${status}）。`, status)
}

export function networkError(): ChatError {
  return makeError('network', '无法连接到服务器，请检查接口地址与网络。')
}

export function timeoutError(): ChatError {
  return makeError('network', '连接超时，请检查接口地址与网络。')
}

export function parseError(): ChatError {
  return makeError('parser', '响应解析失败，请检查接口类型与服务端返回格式。')
}

export function abortedError(): ChatError {
  return makeError('aborted', '已停止生成。')
}

export function configError(detail = ''): ChatError {
  return makeError('config', detail || '尚未完成接口配置。')
}

/** 把任意异常规整为统一错误模型。 */
export function toChatError(err: unknown): ChatError {
  if (isChatError(err)) return err
  if (isAbortError(err)) return abortedError()
  if (err instanceof TypeError) return networkError()
  return makeError('unknown', err instanceof Error ? err.message : String(err))
}

/** 把上游 JSON 错误负载映射为统一错误。 */
export function fromApiErrorPayload(payload: unknown, httpStatus?: number): ChatError {
  let message = ''
  let status = httpStatus
  if (typeof payload === 'string') {
    message = payload
  } else if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.message === 'string') message = record.message
    const err = record.error
    if (typeof err === 'string') {
      message = err
    } else if (err && typeof err === 'object') {
      const nested = err as Record<string, unknown>
      if (typeof nested.message === 'string') message = nested.message
      if (status === undefined && typeof nested.code === 'number') status = nested.code
      if (status === undefined && typeof nested.status === 'number') status = nested.status
    }
  }
  if (status !== undefined && status >= 400) {
    const base = mapHttpStatus(status)
    return makeError(base.kind, message ? `${base.message} ${message}` : base.message, status)
  }
  return makeError('server', message || '服务端返回错误。')
}

/** 读取响应体中的错误说明（截断，避免超长内容进入界面）。 */
export async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        const error = record.error
        if (typeof error === 'string') return error.slice(0, 300)
        if (error && typeof error === 'object') {
          const nested = error as Record<string, unknown>
          if (typeof nested.message === 'string') return nested.message.slice(0, 300)
        }
        if (typeof record.message === 'string') return record.message.slice(0, 300)
      }
    } catch {
      // 非 JSON，按原文截断返回。
    }
    return text.slice(0, 300)
  } catch {
    return ''
  }
}
