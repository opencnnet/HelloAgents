import { StorageQuotaError, type StorageAdapter } from './types'

function isQuotaExceeded(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    )
  }
  return false
}

/** 浏览器实现：localStorage，需处理配额超限异常。 */
export function createWebStorage(): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return null
        return JSON.parse(raw) as T
      } catch {
        // 数据损坏或被浏览器禁用：按不存在处理，不让首屏崩溃。
        return null
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch (err) {
        if (isQuotaExceeded(err)) throw new StorageQuotaError()
        throw err
      }
    },
    async remove(key: string): Promise<void> {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // 读取模式或隐私策略下 removeItem 也可能抛异常，忽略即可。
      }
    },
  }
}
