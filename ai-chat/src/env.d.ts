/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 首次启动的内置默认值：接口类型（openai / local / custom / helloagents） */
  readonly VITE_DEFAULT_API_TYPE?: string
  /** 首次启动的内置默认值：接口地址 */
  readonly VITE_DEFAULT_API_ENDPOINT?: string
  /** 首次启动的内置默认值：模型名称 */
  readonly VITE_DEFAULT_MODEL?: string
  /** 设为 mock 时使用离线模拟传输，便于调试界面 */
  readonly VITE_TRANSPORT?: string
  /** 设为 1 时打开应用即默认使用 HelloAgents 模式并连接本地服务（联调便捷开关） */
  readonly VITE_AUTO_CONNECT_HELLOAGENTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
