<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import MessageList from '@/ui/components/chat/MessageList.vue'
import ChatComposer from '@/ui/components/input/ChatComposer.vue'
import AppHeader from '@/ui/components/layout/AppHeader.vue'
import AppSidebar from '@/ui/components/layout/AppSidebar.vue'
import ConnectionStatusPage from '@/ui/components/layout/ConnectionStatusPage.vue'
import SettingsPage from '@/ui/components/settings/SettingsPage.vue'
import { bundledBackendEndpoint } from '@/adapters/backend'
import { useConnectionStore } from '@/app/stores/connection'
import { useConversationsStore } from '@/app/stores/conversations'
import { useSettingsStore } from '@/app/stores/settings'

const settingsOpen = ref(false)
const connectionsOpen = ref(false)
const drawerOpen = ref(false)
const isNarrow = ref(false)
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null)

const settingsStore = useSettingsStore()
const conversationsStore = useConversationsStore()
const connectionStore = useConnectionStore()

const isEmpty = computed(
  () => !conversationsStore.activeConversation?.messages.length,
)
const sidebarCollapsed = computed(() =>
  isNarrow.value ? !drawerOpen.value : settingsStore.sidebarCollapsed,
)

function onSuggest(text: string): void {
  composerRef.value?.insert(text)
}

function openSettingsPage(): void {
  settingsOpen.value = true
  connectionsOpen.value = false
}

function openConnectionsPage(): void {
  connectionsOpen.value = true
  settingsOpen.value = false
}

function showChatPage(): void {
  settingsOpen.value = false
  connectionsOpen.value = false
}

/** 桌面端切换侧栏收起；窄屏（抽屉模式）则打开抽屉。 */
function toggleSidebar(): void {
  if (isNarrow.value) {
    drawerOpen.value = !drawerOpen.value
    return
  }
  void settingsStore.setSidebarCollapsed(!settingsStore.sidebarCollapsed)
}

function onResize(): void {
  isNarrow.value = window.matchMedia('(max-width: 860px)').matches
  if (!isNarrow.value) drawerOpen.value = false
}

function onBeforeUnload(): void {
  conversationsStore.flushPersist()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && drawerOpen.value) drawerOpen.value = false
}

onMounted(async () => {
  onResize()
  await settingsStore.load()
  await applyBundledBackend()
  await conversationsStore.load()
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  await connectionStore.refresh(settingsStore.settings, settingsStore.isConfigured)
})

/** 桌面端启动时把内置后端地址写进设置，用户只需再填模型配置。 */
async function applyBundledBackend(): Promise<void> {
  const endpoint = await bundledBackendEndpoint()
  if (!endpoint) return
  const current = settingsStore.settings.agentConnection.endpoint.trim()
  // 内置后端端口每次启动都会变：本机回环地址一律跟随内置后端，
  // 用户填写的远程/LAN 地址保持不动。
  const isLoopback = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/.test(current)
  if (current && !isLoopback) return
  await settingsStore.save({
    ...settingsStore.settings,
    apiType: 'helloagents',
    endpoint,
    agentConnection: { ...settingsStore.settings.agentConnection, endpoint },
  })
}

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <AppSidebar
      :drawer-open="drawerOpen"
      :collapsed="sidebarCollapsed"
      :settings-active="settingsOpen"
      :connections-active="connectionsOpen"
      @close-drawer="drawerOpen = false"
      @open-settings="openSettingsPage"
      @open-connections="openConnectionsPage"
      @navigate-chat="showChatPage"
      @toggle-sidebar="toggleSidebar"
    />

    <div
      class="app-main"
      :class="{
        'is-empty': isEmpty && !settingsOpen && !connectionsOpen,
        'settings-main': settingsOpen || connectionsOpen,
      }"
    >
      <SettingsPage
        v-if="settingsOpen"
        v-model:open="settingsOpen"
      />
      <ConnectionStatusPage v-else-if="connectionsOpen" />
      <template v-else>
        <AppHeader v-if="!isEmpty" :collapsed="sidebarCollapsed" @toggle-sidebar="toggleSidebar" />
        <MessageList @suggest="onSuggest" />
        <ChatComposer ref="composerRef" />
      </template>
    </div>

    <div class="drawer-overlay" :class="{ show: drawerOpen }" @click="drawerOpen = false"></div>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
  transition: grid-template-columns 0.2s ease;
}

.app-shell.sidebar-collapsed {
  grid-template-columns: var(--sidebar-rail-width) minmax(0, 1fr);
}

.app-main.is-empty :deep(.composer-zone) {
  position: absolute;
  z-index: 2;
  top: 43%;
  right: 0;
  left: 0;
  transform: translateY(-50%);
}

.app-main {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.app-main.settings-main {
  overflow: hidden;
}

.drawer-overlay {
  display: none;
}

@media (max-width: 860px) {
  .app-shell,
  .app-shell.sidebar-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-main.is-empty :deep(.composer-zone) {
    top: 45%;
  }

  .drawer-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 35;
    background: var(--overlay);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.22s;
  }

  .drawer-overlay.show {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
