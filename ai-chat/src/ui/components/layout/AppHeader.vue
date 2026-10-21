<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/ui/components/common/AppIcon.vue'
import WindowControls from '@/ui/components/layout/WindowControls.vue'
import { useConversationsStore } from '@/app/stores/conversations'
import { formatHeaderTime } from '@/shared/utils/format'

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ (event: 'toggle-sidebar'): void }>()

const store = useConversationsStore()

const conversation = computed(() => store.activeConversation)
const title = computed(() => conversation.value?.title ?? 'HelloAgents 对话')
const meta = computed(() => {
  const current = conversation.value
  if (!current) return '新建或选择一个对话'
  if (current.messages.length === 0) return `创建于 ${formatHeaderTime(current.createdAt)}`
  const last = current.messages[current.messages.length - 1]
  return `${current.messages.length} 条消息 · ${formatHeaderTime(last?.createdAt ?? current.updatedAt)}`
})
</script>

<template>
  <header class="topbar" data-tauri-drag-region>
    <button
      class="icon-btn toggle-btn"
      :aria-label="props.collapsed ? '展开侧栏' : '收起侧栏'"
      :title="props.collapsed ? '展开侧栏' : '收起侧栏'"
      @click="emit('toggle-sidebar')"
    >
      <AppIcon :name="props.collapsed ? 'chevron-right' : 'chevron-left'" :size="18" />
    </button>
    <div class="topbar-info" data-tauri-drag-region>
      <div class="topbar-title" data-tauri-drag-region>{{ title }}</div>
      <div class="topbar-meta" data-tauri-drag-region>{{ meta }}</div>
    </div>
    <WindowControls />
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 18px;
  flex: none;
}

.topbar-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.topbar-title {
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-meta {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 8px;
  color: var(--text-secondary);
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

/* 侧栏收起/展开统一由 logo 触发；此按钮只在抽屉模式（窄屏）下充当入口。 */
.toggle-btn {
  display: none;
}

@media (max-width: 860px) {
  .topbar {
    padding: 0 14px;
  }

  .toggle-btn {
    display: inline-flex;
  }
}
</style>
