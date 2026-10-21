<script setup lang="ts">
import { AGENT_TYPE_LABELS, API_TYPE_LABELS } from '@config/app.config'
import { useColumnResize } from '@/app/composables/useColumnResize'
import { useConnectionStore } from '@/app/stores/connection'
import { useSettingsStore } from '@/app/stores/settings'
import WindowControls from '@/ui/components/layout/WindowControls.vue'
import type { MCPServerSettings } from '@/shared/types'

const connectionStore = useConnectionStore()
const settingsStore = useSettingsStore()
const { tableStyle, resizeColumn, onColumnResizeKeydown } = useColumnResize([
  0.8, 0.85, 1.15, 2.4, 1.05,
])

/** MCP 只在聊天请求时按需拉起，没有常驻连接可统计。 */
function mcpPhaseLabel(server: MCPServerSettings): string {
  if (!server.enabled) return '已禁用'
  return server.transport === 'stdio' ? '按需启动' : '按需连接'
}

function phaseLabel(phase: string): string {
  if (phase === 'connected') return '已连接'
  if (phase === 'checking') return '检测中'
  if (phase === 'error') return '连接失败'
  return '未配置'
}

function connectionAddress(endpoint: string): string {
  return endpoint.trim() || '—'
}

function modelConnectionName(): string {
  return settingsStore.settings.modelConnection.name || API_TYPE_LABELS[
    settingsStore.settings.modelConnection.apiType
  ]
}

function agentConnectionName(): string {
  return settingsStore.settings.agentConnection.name || '本地智能体'
}
</script>

<template>
  <main class="connection-page" aria-labelledby="connection-title">
    <header class="connection-head" data-tauri-drag-region>
      <div class="connection-head-text" data-tauri-drag-region>
        <div id="connection-title" class="connection-title" data-tauri-drag-region>
          连接状态
        </div>
        <div class="connection-sub" data-tauri-drag-region>
          查看大模型、智能体与 MCP 服务的连接信息。
        </div>
      </div>
      <WindowControls />
    </header>

    <div class="connection-body">
      <section class="connection-card" aria-label="连接详情">
        <div class="connection-table-scroll">
          <div class="data-table" :style="tableStyle">
            <div class="data-table-row data-table-head">
              <span v-for="(label, index) in ['服务', '状态', '名称', '地址', '类型']" :key="label">
                {{ label }}
                <button
                  v-if="index < 4"
                  class="column-resizer"
                  type="button"
                  role="separator"
                  aria-orientation="vertical"
                  :aria-label="`调整${label}列宽`"
                  :title="`拖动调整${label}列宽`"
                  @pointerdown="resizeColumn(index, $event)"
                  @keydown="onColumnResizeKeydown(index, $event)"
                ></button>
              </span>
            </div>
            <div class="data-table-row">
              <span class="connection-service">大模型</span>
              <span
                class="connection-phase"
                :class="`phase-${connectionStore.modelConnection.phase}`"
              >
                {{ phaseLabel(connectionStore.modelConnection.phase) }}
              </span>
              <span
                class="connection-name"
                :title="`${modelConnectionName()} · ${settingsStore.settings.modelConnection.model || '未配置模型'}`"
              >
                {{ modelConnectionName() }}
              </span>
              <span
                class="connection-address"
                :title="connectionAddress(settingsStore.settings.modelConnection.endpoint)"
              >
                {{ connectionAddress(settingsStore.settings.modelConnection.endpoint) }}
              </span>
              <span class="connection-type">
                {{ API_TYPE_LABELS[settingsStore.settings.modelConnection.apiType] }}
              </span>
            </div>
            <div class="data-table-row">
              <span class="connection-service">智能体</span>
              <span
                class="connection-phase"
                :class="`phase-${connectionStore.agentConnection.phase}`"
              >
                {{ phaseLabel(connectionStore.agentConnection.phase) }}
              </span>
              <span class="connection-name" :title="agentConnectionName()">
                {{ agentConnectionName() }}
              </span>
              <span
                class="connection-address"
                :title="connectionAddress(settingsStore.settings.agentConnection.endpoint)"
              >
                {{ connectionAddress(settingsStore.settings.agentConnection.endpoint) }}
              </span>
              <span class="connection-type">
                {{ AGENT_TYPE_LABELS[settingsStore.settings.agentType] }}
              </span>
            </div>
            <div
              v-for="server in settingsStore.settings.mcpServers"
              :key="server.name"
              class="data-table-row"
            >
              <span class="connection-service">MCP</span>
              <span
                class="connection-phase"
                :class="server.enabled ? 'phase-on-demand' : 'phase-disabled'"
                :title="
                  server.enabled
                    ? '由后端在聊天请求时按需启动/连接，不做常驻连接检测'
                    : '该服务未启用'
                "
              >
                {{ mcpPhaseLabel(server) }}
              </span>
              <span class="connection-name" :title="server.name || '未命名'">
                {{ server.name || '未命名' }}
              </span>
              <span
                class="connection-address"
                :title="server.transport === 'stdio' ? server.command : server.url"
              >
                {{ server.transport === 'stdio' ? server.command || '—' : server.url || '—' }}
              </span>
              <span class="connection-type">
                {{ server.transport === 'stdio' ? 'stdio' : 'Streamable HTTP' }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.connection-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}

.connection-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  box-sizing: border-box;
  flex: none;
}

.connection-head-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.connection-title {
  font-size: 17px;
  font-weight: 650;
}

.connection-sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.connection-body {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 18px 28px 24px;
  box-sizing: border-box;
  overflow-y: auto;
}

.connection-card {
  display: block;
}

.connection-table-scroll {
  overflow-x: auto;
}

.connection-name,
.connection-address,
.connection-type,
.connection-phase,
.connection-service {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-phase {
  width: fit-content;
  max-width: 100%;
  padding: 0 0.55em;
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 0.88em;
  line-height: 1.7;
}

.phase-on-demand {
  color: var(--text-secondary);
  background: var(--bg-soft);
}

.connection-address {
  color: var(--text-secondary);
  font-size: 0.92em;
}

.connection-service {
  color: var(--text-secondary);
}

.connection-name {
  font-weight: 500;
  color: var(--text);
}

.phase-connected {
  color: var(--success);
  background: var(--success-wash);
}

.phase-error,
.phase-unconfigured {
  color: var(--danger);
  background: var(--danger-wash);
}

.phase-checking {
  color: var(--primary);
  background: var(--primary-wash);
}

.phase-disabled {
  color: var(--text-tertiary);
}

@media (max-width: 640px) {
  .connection-head {
    padding: 0 14px;
  }

  .connection-body {
    padding: 14px;
  }

  .connection-card {
    padding: 0;
  }

  .data-table {
    --data-row-height: 32px;
    min-width: 620px;
  }
}
</style>
