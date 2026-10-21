import { isTauri } from '@/adapters/env'

import { createMockTransport } from './mock'
import { createTauriTransport } from './tauri'
import type { ChatTransport } from './types'
import { createWebTransport } from './web'

let transport: ChatTransport | null = null

/** 按运行环境返回请求适配器（惰性单例）。 */
export function getTransport(): ChatTransport {
  if (!transport) {
    if (import.meta.env.VITE_TRANSPORT === 'mock') {
      transport = createMockTransport()
    } else {
      transport = isTauri ? createTauriTransport() : createWebTransport()
    }
  }
  return transport
}

export type { ChatRequest, ChatTransport, FinishInfo, ProbeResult, StreamCallbacks, WireMessage } from './types'
