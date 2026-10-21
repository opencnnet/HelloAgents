import { isTauri } from '../env'
import { createTauriStorage } from './tauri'
import type { StorageAdapter } from './types'
import { createWebStorage } from './web'

let adapter: StorageAdapter | null = null

/** 按运行环境返回存储适配器（惰性单例）。 */
export function getStorage(): StorageAdapter {
  if (!adapter) {
    adapter = isTauri ? createTauriStorage() : createWebStorage()
  }
  return adapter
}

export { StorageQuotaError } from './types'
export type { StorageAdapter } from './types'
