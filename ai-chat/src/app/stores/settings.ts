import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  isSettingsConfigured,
  resolveDefaultSettings,
  sanitizeSettings,
  STORAGE_KEYS,
} from '@config/app.config'
import { getStorage } from '@/adapters/storage'
import type { ChatSettings, Theme } from '@/shared/types'

const storage = getStorage()

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<ChatSettings>(resolveDefaultSettings())
  const theme = ref<Theme>('light')
  const sidebarCollapsed = ref(false)
  const loaded = ref(false)

  const isConfigured = computed(() => isSettingsConfigured(settings.value))

  function applyTheme(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme.value
    }
  }

  /** 读取本地设置；无记录时落回内置默认值。 */
  async function load(): Promise<void> {
    if (loaded.value) return
    const saved = await storage.get<Partial<ChatSettings>>(STORAGE_KEYS.settings)
    const resolved = saved ? sanitizeSettings(saved) : resolveDefaultSettings()
    // 联调模式：若历史设置仍处于未配置状态，直接套用 HelloAgents 默认值。
    const autoConnect = import.meta.env.VITE_AUTO_CONNECT_HELLOAGENTS === '1'
    settings.value =
      autoConnect && !isSettingsConfigured(resolved) ? resolveDefaultSettings() : resolved
    const savedTheme = await storage.get<string>(STORAGE_KEYS.theme)
    theme.value = savedTheme === 'dark' ? 'dark' : 'light'
    const savedSidebar = await storage.get<unknown>(STORAGE_KEYS.sidebarCollapsed)
    sidebarCollapsed.value = savedSidebar === true
    applyTheme()
    loaded.value = true
  }

  async function save(next: ChatSettings): Promise<void> {
    // 先落盘再更新内存：写失败时界面上不会出现"保存失败但已生效"的错位。
    const sanitized = sanitizeSettings(next)
    await storage.set(STORAGE_KEYS.settings, sanitized)
    settings.value = sanitized
  }

  async function toggleTheme(): Promise<void> {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    applyTheme()
    try {
      await storage.set(STORAGE_KEYS.theme, theme.value)
    } catch (err) {
      console.warn('主题偏好保存失败：', err)
    }
  }

  /** 桌面端侧栏收起状态，随主题一起保存在本地。 */
  async function setSidebarCollapsed(value: boolean): Promise<void> {
    sidebarCollapsed.value = value
    try {
      await storage.set(STORAGE_KEYS.sidebarCollapsed, value)
    } catch (err) {
      console.warn('侧栏偏好保存失败：', err)
    }
  }

  /** 清空本地数据：回到未配置状态。 */
  async function clear(): Promise<void> {
    settings.value = resolveDefaultSettings()
    theme.value = 'light'
    sidebarCollapsed.value = false
    applyTheme()
    await Promise.allSettled([
      storage.remove(STORAGE_KEYS.settings),
      storage.remove(STORAGE_KEYS.theme),
      storage.remove(STORAGE_KEYS.sidebarCollapsed),
    ])
  }

  return {
    settings,
    theme,
    sidebarCollapsed,
    loaded,
    isConfigured,
    load,
    save,
    toggleTheme,
    setSidebarCollapsed,
    clear,
  }
})
