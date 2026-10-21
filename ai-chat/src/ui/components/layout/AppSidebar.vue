<script setup lang="ts">
import AppIcon from '@/ui/components/common/AppIcon.vue'
import BrandLogo from '@/ui/components/common/BrandLogo.vue'
import ConversationList from '@/ui/components/conversation/ConversationList.vue'
import AppStatusBar from '@/ui/components/layout/AppStatusBar.vue'
import { useConversationsStore } from '@/app/stores/conversations'
import { useSettingsStore } from '@/app/stores/settings'

const props = defineProps<{
  drawerOpen: boolean
  collapsed: boolean
  settingsActive: boolean
  connectionsActive: boolean
}>()
const emit = defineEmits<{
  (event: 'close-drawer'): void
  (event: 'open-settings'): void
  (event: 'open-connections'): void
  (event: 'navigate-chat'): void
  (event: 'toggle-sidebar'): void
}>()

const settingsStore = useSettingsStore()
const conversations = useConversationsStore()

function createConversation(): void {
  const settings = settingsStore.settings
  const snapshot =
    settings.apiType === 'helloagents'
      ? `智能体 · ${settings.agentType}`
      : settings.model || '未配置模型'
  conversations.createConversation(snapshot)
  emit('close-drawer')
  emit('navigate-chat')
}

function openSettings(): void {
  emit('close-drawer')
  emit('open-settings')
}

function openConnections(): void {
  emit('close-drawer')
  emit('open-connections')
}

</script>

<template>
  <aside class="sidebar" :class="{ open: props.drawerOpen, collapsed: props.collapsed }">
    <div class="sidebar-inner">
      <button
        v-if="props.collapsed"
        class="rail-brand"
        aria-label="展开侧栏"
        title="展开侧栏"
        @click="emit('toggle-sidebar')"
      >
        <BrandLogo :size="26" tail-side="right" />
      </button>
      <button
        v-else
        class="brand"
        aria-label="收起侧栏"
        title="收起侧栏"
        @click="emit('toggle-sidebar')"
      >
        <BrandLogo :size="28" class="brand-logo" />
        <span class="brand-text">
          <strong>HelloAgents</strong>
          <span>AI 助手</span>
        </span>
      </button>

      <button
        class="new-chat"
        :class="{
          active:
            !conversations.activeConversation ||
            conversations.activeConversation.messages.length === 0,
        }"
        @click="createConversation"
      >
        <AppIcon name="plus" :size="14" />
        <span>新对话</span>
      </button>

      <div class="sidebar-section-label">最近</div>
      <ConversationList
        @navigated="() => { emit('close-drawer'); emit('navigate-chat') }"
      />

      <div class="sidebar-foot">
        <button
          class="settings-entry"
          :class="{ active: props.settingsActive }"
          aria-label="设置"
          title="设置"
          @click="openSettings"
        >
          <AppIcon name="settings" :size="16" />
          <span>设置</span>
          <span v-if="!settingsStore.isConfigured" class="badge">待配置</span>
        </button>
        <button
          class="theme-toggle"
          :aria-label="settingsStore.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          :title="settingsStore.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="settingsStore.toggleTheme()"
        >
          <AppIcon :name="settingsStore.theme === 'dark' ? 'sun' : 'moon'" :size="16" />
        </button>
        <AppStatusBar
          :collapsed="props.collapsed"
          :active="props.connectionsActive"
          @open-connections="openConnections"
        />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  z-index: 40;
  min-height: 0;
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  overflow: hidden;
  transition: width 0.2s ease;
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: var(--sidebar-width);
  padding: 14px 10px 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% + 12px);
  min-height: 44px;
  margin: 0 -6px 12px;
  padding: 2px 6px;
  border-radius: 10px;
  text-align: left;
  transition: background 0.15s ease;
}

/* 整块品牌区都是收起/展开的热区，hover 与收起态保持一致。 */
.brand:hover,
.rail-brand:hover {
  background: var(--bg-hover);
}

.brand:active,
.rail-brand:active {
  background: var(--bg-active);
}

.rail-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 38px;
  margin-bottom: 10px;
  border-radius: 8px;
}

.rail-brand:hover {
  background: var(--bg-hover);
}

.brand-logo {
  border-radius: 7px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.12);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brand-text strong {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.brand-text span {
  font-size: 11px;
  color: var(--text-tertiary);
}

.new-chat {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  height: 38px;
  margin-bottom: 10px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.new-chat:hover {
  background: var(--bg-raised);
  border-color: var(--border);
  color: var(--text);
}

.new-chat.active {
  background: var(--bg-active);
  color: var(--text);
}

.new-chat.active:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}

.sidebar-section-label {
  padding: 12px 8px 6px;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 550;
  letter-spacing: 0.01em;
}

.sidebar-foot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0 0;
  border-top: 1px solid var(--border);
}

.settings-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: left;
}

.settings-entry:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.settings-entry.active {
  background: var(--bg-active);
  color: var(--text);
}

.badge {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--primary-wash);
  color: var(--primary);
  font-size: 10.5px;
  flex: none;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-tertiary);
  text-align: left;
}

.theme-toggle:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.theme-toggle::after {
  content: '主题';
  font-size: 13px;
}

.sidebar.collapsed {
  width: var(--sidebar-rail-width);
}

.sidebar.collapsed .sidebar-inner {
  width: var(--sidebar-rail-width);
  align-items: center;
  padding: 12px 6px;
}

.sidebar.collapsed .rail-brand,
.sidebar.collapsed .new-chat,
.sidebar.collapsed .settings-entry,
.sidebar.collapsed .theme-toggle {
  box-sizing: border-box;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: none;
  padding: 0;
}

.sidebar.collapsed .rail-brand {
  margin-bottom: 10px;
}

.sidebar.collapsed .new-chat span,
.sidebar.collapsed .sidebar-section-label,
.sidebar.collapsed .conv-scroll,
.sidebar.collapsed .settings-entry span,
.sidebar.collapsed .theme-toggle::after {
  display: none;
}

.sidebar.collapsed .new-chat {
  margin-bottom: 4px;
}

.sidebar.collapsed .sidebar-foot {
  align-items: center;
  width: 100%;
  margin-top: auto;
  border-top: 0;
}

.sidebar.collapsed .badge {
  display: none;
}

@media (max-width: 860px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(300px, 84vw);
    transform: translateX(-102%);
    transition: transform 0.22s ease;
    box-shadow: 0 0 60px rgba(16, 24, 40, 0.2);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-inner {
    width: 100%;
  }

  .sidebar.collapsed {
    width: min(300px, 84vw);
  }

  .sidebar.collapsed .sidebar-inner {
    width: 100%;
    align-items: stretch;
    padding: 14px 10px 10px;
  }

  .sidebar.collapsed .new-chat,
  .sidebar.collapsed .settings-entry,
  .sidebar.collapsed .theme-toggle {
    justify-content: flex-start;
    width: 100%;
    padding: 0 10px;
  }

  .sidebar.collapsed .new-chat span,
  .sidebar.collapsed .settings-entry span,
  .sidebar.collapsed .theme-toggle::after {
    display: inline;
  }

  .sidebar.collapsed .sidebar-foot {
    align-items: stretch;
    margin-top: 0;
  }
}
</style>
