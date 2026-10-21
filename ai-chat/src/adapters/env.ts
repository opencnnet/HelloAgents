/**
 * 运行时探测：唯一允许感知 Web / Tauri 环境差异的模块之一。
 * 其余业务代码通过这里导出的信息做展示，不直接触碰 Tauri API。
 */
export type RuntimeKind = 'web' | 'tauri'

export function detectRuntime(): RuntimeKind {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return 'tauri'
  }
  return 'web'
}

export const runtime: RuntimeKind = detectRuntime()
export const isTauri = runtime === 'tauri'

/** 状态栏右侧展示的运行环境文案。 */
export function runtimeLabel(): string {
  return isTauri ? '桌面端' : 'Web 端'
}

/** 尽力而为的平台信息（用于调试与展示，不做业务判断）。 */
export function platformLabel(): string {
  if (typeof navigator === 'undefined') return '未知平台'
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return '未知平台'
}
