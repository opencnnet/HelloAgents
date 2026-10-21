import { getCurrentWindow } from '@tauri-apps/api/window'

import { isTauri } from '@/adapters/env'

/**
 * 无边框窗口的自绘控制按钮：Web 端没有原生窗口，全部空实现。
 * 仅在 adapters 层接触 Tauri API，界面组件只调用这里。
 */
export function minimizeWindow(): void {
  if (!isTauri) return
  void getCurrentWindow().minimize()
}

export function toggleMaximizeWindow(): void {
  if (!isTauri) return
  void getCurrentWindow().toggleMaximize()
}

export function closeWindow(): void {
  if (!isTauri) return
  void getCurrentWindow().close()
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri) return false
  try {
    return await getCurrentWindow().isMaximized()
  } catch {
    return false
  }
}
