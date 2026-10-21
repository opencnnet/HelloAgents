<script setup lang="ts">
import { computed } from 'vue'

import { useConnectionStore } from '@/app/stores/connection'

const emit = defineEmits<{ (event: 'open-connections'): void }>()
const props = defineProps<{ collapsed: boolean; active: boolean }>()

const connectionStore = useConnectionStore()

// MCP 服务在聊天请求时按需启动，没有常驻连接，因此只统计大模型与智能体。
const allConnected = computed(
  () =>
    connectionStore.modelConnection.phase === 'connected' &&
    connectionStore.agentConnection.phase === 'connected',
)
const isChecking = computed(
  () =>
    connectionStore.modelConnection.phase === 'checking' ||
    connectionStore.agentConnection.phase === 'checking',
)
const statusLabel = computed(() => (allConnected.value ? '已连接' : '未连接'))
</script>

<template>
  <div class="sidebar-connection" :class="{ collapsed: props.collapsed }">
    <button
      class="status-indicator"
      :class="{
        connected: allConnected,
        checking: isChecking && !allConnected,
        disconnected: !allConnected && !isChecking,
        active: props.active,
      }"
      :aria-label="`连接状态：${statusLabel}，点击查看详情`"
      title="查看连接状态"
      @click="emit('open-connections')"
    >
      <span class="status-icon">
        <span class="dot" :class="{ 'dot-pulse': isChecking && !allConnected }"></span>
      </span>
      <span class="status-label">状态</span>
    </button>
  </div>
</template>

<style scoped>
.sidebar-connection {
  display: flex;
  width: 100%;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: left;
}

.status-indicator:hover,
.status-indicator.active {
  background: var(--bg-hover);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(217, 45, 32, 0.12);
}

.status-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.status-indicator.connected .dot {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-wash);
}

.status-indicator.checking .dot {
  background: var(--primary);
  box-shadow: 0 0 0 3px rgba(77, 107, 254, 0.12);
}

.dot-pulse {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}

.sidebar-connection.collapsed {
  justify-content: center;
  width: 40px;
  padding: 0;
}

.sidebar-connection.collapsed .status-indicator {
  justify-content: center;
  gap: 0;
  width: 40px;
  height: 40px;
  padding: 0;
}

.sidebar-connection.collapsed .status-icon {
  width: 16px;
}

.sidebar-connection.collapsed .status-label {
  display: none;
}

@media (max-width: 860px) {
  .sidebar-connection.collapsed {
    justify-content: flex-start;
    width: 100%;
    padding: 0 10px;
  }

  .sidebar-connection.collapsed .status-indicator {
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    height: 36px;
    padding: 0 10px;
  }

  .sidebar-connection.collapsed .status-icon {
    width: 16px;
  }

  .sidebar-connection.collapsed .status-label {
    display: inline;
  }
}
</style>
