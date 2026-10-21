import { invoke } from '@tauri-apps/api/core'

import { isTauri } from '@/adapters/env'

/**
 * 桌面端内置后端地址：安装包自带 sidecar，由 Rust 在启动时拉起并等待就绪。
 * Web 端没有内置后端，返回 null 由用户自行填写智能体服务地址。
 */
export async function bundledBackendEndpoint(): Promise<string | null> {
  if (!isTauri) return null
  try {
    const endpoint = await invoke<string>('backend_endpoint')
    return endpoint.trim() || null
  } catch (err) {
    console.warn('内置后端未就绪：', err)
    return null
  }
}
