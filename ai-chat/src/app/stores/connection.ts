import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { getTransport } from '@/adapters/transport'
import { toChatError } from '@/adapters/transport/errors'
import { endpointHost, modelLabel } from '@/adapters/transport/protocol'
import type { ChatError, ChatSettings, ConnectionInfo } from '@/shared/types'

export const useConnectionStore = defineStore('connection', () => {
  const connection = ref<ConnectionInfo>({ phase: 'unchecked' })
  const modelConnection = ref<ConnectionInfo>({ phase: 'unconfigured' })
  const agentConnection = ref<ConnectionInfo>({ phase: 'unconfigured' })
  const transport = getTransport()
  let refreshSeq = 0

  const phase = computed(() => connection.value.phase)

  /** 保存设置后重新检测连通性。 */
  async function refresh(settings: ChatSettings, configured: boolean): Promise<void> {
    const seq = ++refreshSeq
    const modelSettings: ChatSettings = {
      ...settings,
      ...settings.modelConnection,
    }
    const agentSettings: ChatSettings = {
      ...settings,
      apiType: 'helloagents',
      endpoint: settings.agentConnection.endpoint,
      apiKey: settings.agentConnection.apiKey,
    }
    const modelConfigured =
      Boolean(modelSettings.endpoint.trim()) && Boolean(modelSettings.model.trim())
    const agentConfigured = Boolean(agentSettings.endpoint.trim())
    modelConnection.value = { phase: modelConfigured ? 'checking' : 'unconfigured' }
    agentConnection.value = { phase: agentConfigured ? 'checking' : 'unconfigured' }
    connection.value = configured ? { phase: 'checking' } : { phase: 'unconfigured' }

    const probe = async (target: ChatSettings, ready: boolean): Promise<ConnectionInfo> => {
      if (!ready) return { phase: 'unconfigured' }
      try {
        const result = await transport.testConnection(target)
        return {
          phase: 'connected',
          host: result.host,
          model: result.model || modelLabel(target),
          latencyMs: result.latencyMs,
        }
      } catch (err) {
        return { phase: 'error', error: toChatError(err) }
      }
    }

    const [modelResult, agentResult] = await Promise.all([
      probe(modelSettings, modelConfigured),
      probe(agentSettings, agentConfigured),
    ])
    if (seq !== refreshSeq) return
    modelConnection.value = modelResult
    agentConnection.value = agentResult
    connection.value = settings.apiType === 'helloagents' ? agentResult : modelResult
  }

  /** 设置页「测试连接」后同步单个服务的状态，不等保存。 */
  function setServiceStatus(kind: 'model' | 'agent', info: ConnectionInfo): void {
    refreshSeq += 1
    if (kind === 'agent') agentConnection.value = info
    else modelConnection.value = info
  }

  function markUnconfigured(): void {
    refreshSeq += 1
    connection.value = { phase: 'unconfigured' }
    modelConnection.value = { phase: 'unconfigured' }
    agentConnection.value = { phase: 'unconfigured' }
  }

  /** 请求失败时同步到全局状态栏。 */
  function markError(error: ChatError, settings?: ChatSettings): void {
    refreshSeq += 1
    connection.value = { phase: 'error', error }
    if (settings?.apiType === 'helloagents') {
      agentConnection.value = { phase: 'error', error }
    } else if (settings) {
      modelConnection.value = { phase: 'error', error }
    }
  }

  /** 请求成功完成时恢复为已连接。 */
  function markConnected(settings: ChatSettings): void {
    refreshSeq += 1
    connection.value = {
      phase: 'connected',
      host: endpointHost(settings.endpoint),
      model: modelLabel(settings),
      latencyMs: connection.value.latencyMs,
    }
    const status = { ...connection.value }
    if (settings.apiType === 'helloagents') agentConnection.value = status
    else modelConnection.value = status
  }

  function markUnchecked(): void {
    refreshSeq += 1
    connection.value = { phase: 'unchecked' }
  }

  return {
    connection,
    modelConnection,
    agentConnection,
    phase,
    refresh,
    markUnconfigured,
    markError,
    markConnected,
    setServiceStatus,
    markUnchecked,
  }
})
