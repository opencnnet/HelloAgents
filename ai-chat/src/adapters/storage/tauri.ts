import { invoke } from '@tauri-apps/api/core'
import type { StorageAdapter } from './types'

interface LegacyStore {
  get<T>(key: string): Promise<T | undefined>
  delete(key: string): Promise<boolean>
  save(): Promise<void>
}

let legacyStorePromise: Promise<LegacyStore> | null = null

async function getLegacyStore(): Promise<LegacyStore> {
  if (!legacyStorePromise) {
    legacyStorePromise = (async () => {
      const { load } = await import('@tauri-apps/plugin-store')
      return (await load('store.json', { autoSave: false })) as unknown as LegacyStore
    })()
  }
  return legacyStorePromise
}

/** Tauri 实现：SQLite 持久化，首次读取时迁移旧 Store 数据。 */
export function createTauriStorage(): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const serialized = await invoke<string | null>('storage_get', { key })
      if (serialized !== null) return JSON.parse(serialized) as T

      const legacyStore = await getLegacyStore()
      const value = await legacyStore.get<T>(key)
      if (value === undefined) return null

      await invoke('storage_set', { key, value: JSON.stringify(value) })
      await legacyStore.delete(key)
      await legacyStore.save()
      return value
    },
    async set<T>(key: string, value: T): Promise<void> {
      await invoke('storage_set', { key, value: JSON.stringify(value) })
    },
    async remove(key: string): Promise<void> {
      await invoke('storage_remove', { key })
      const legacyStore = await getLegacyStore()
      await legacyStore.delete(key)
      await legacyStore.save()
    },
  }
}
