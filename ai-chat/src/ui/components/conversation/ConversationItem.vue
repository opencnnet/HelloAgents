<script setup lang="ts">
import { nextTick, ref } from 'vue'

import AppIcon from '@/ui/components/common/AppIcon.vue'
import type { Conversation } from '@/shared/types'
import { formatListTime } from '@/shared/utils/format'

const props = defineProps<{
  conversation: Conversation
  active: boolean
}>()

const emit = defineEmits<{
  (event: 'select'): void
  (event: 'rename', title: string): void
  (event: 'remove'): void
}>()

const editing = ref(false)
const confirming = ref(false)
const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function onSelect(): void {
  if (editing.value || confirming.value) return
  emit('select')
}

async function startRename(): Promise<void> {
  draft.value = props.conversation.title
  editing.value = true
  confirming.value = false
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function confirmRename(): void {
  if (!editing.value) return
  editing.value = false
  const title = draft.value.trim()
  if (title && title !== props.conversation.title) emit('rename', title)
}

function cancelRename(): void {
  editing.value = false
}

function remove(): void {
  confirming.value = false
  emit('remove')
}
</script>

<template>
  <div
    class="conv-item"
    :class="{ active: props.active }"
    role="button"
    tabindex="0"
    @click="onSelect"
    @keydown.enter.prevent="onSelect"
    @dblclick.stop="startRename"
  >
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model="draft"
        class="rename-input"
        maxlength="60"
        aria-label="重命名会话"
        @click.stop
        @keydown.enter.prevent="confirmRename"
        @keydown.esc.prevent="cancelRename"
        @blur="confirmRename"
      />
    </template>
    <template v-else-if="confirming">
      <span class="confirm-text">删除这个对话？</span>
      <span class="confirm-actions">
        <button class="danger" @click.stop="remove">删除</button>
        <button @click.stop="confirming = false">取消</button>
      </span>
    </template>
    <template v-else>
      <span class="conv-title">{{ props.conversation.title }}</span>
      <span class="conv-time">{{ formatListTime(props.conversation.updatedAt) }}</span>
      <span class="conv-actions">
        <button aria-label="重命名" title="重命名" @click.stop="startRename">
          <AppIcon name="edit" :size="13" />
        </button>
        <button aria-label="删除" title="删除" @click.stop="confirming = true">
          <AppIcon name="trash" :size="13" />
        </button>
      </span>
    </template>
  </div>
</template>

<style scoped>
.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 8px 8px 10px;
  margin-bottom: 2px;
  border-radius: 8px;
  text-align: left;
  color: var(--text-secondary);
  transition: background 0.12s, color 0.12s;
}

.conv-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.conv-item.active {
  background: var(--bg-active);
  color: var(--text);
}

.conv-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.conv-time {
  font-size: 11px;
  color: var(--text-tertiary);
  flex: none;
}

.conv-actions {
  display: none;
  gap: 2px;
  flex: none;
}

.conv-item:hover .conv-actions,
.conv-item:focus-within .conv-actions {
  display: flex;
}

.conv-item:hover .conv-time,
.conv-item:focus-within .conv-time {
  display: none;
}

.conv-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-tertiary);
}

.conv-actions button:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.rename-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--primary);
  border-radius: 6px;
  background: var(--bg);
  font-size: 13px;
  color: var(--text);
  outline: none;
}

.confirm-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--danger);
}

.confirm-actions {
  display: flex;
  gap: 4px;
  flex: none;
}

.confirm-actions button {
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg);
}

.confirm-actions button:hover {
  border-color: var(--text-tertiary);
  color: var(--text);
}

.confirm-actions .danger {
  border-color: var(--danger-line);
  color: var(--danger);
}

.confirm-actions .danger:hover {
  border-color: var(--danger);
  background: var(--danger-wash);
}
</style>
