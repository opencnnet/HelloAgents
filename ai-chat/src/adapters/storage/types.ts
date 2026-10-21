/** 存储适配器的统一异步接口：内部负责序列化，调用方只关心对象。 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

/** Web 实现中配额超限的专用错误，由 store 层决定如何提示。 */
export class StorageQuotaError extends Error {
  constructor(message = '本地存储空间不足，最近的改动可能无法保存。') {
    super(message)
    this.name = 'StorageQuotaError'
  }
}
