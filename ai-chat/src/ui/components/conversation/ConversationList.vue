<script setup lang="ts">
import { computed } from 'vue'

import ConversationItem from '@/ui/components/conversation/ConversationItem.vue'
import { useConversationsStore } from '@/app/stores/conversations'
import type { Conversation } from '@/shared/types'

const emit = defineEmits<{ (event: 'navigated'): void }>()

const store = useConversationsStore()
const DAY_MS = 24 * 60 * 60 * 1000

interface ConversationGroup {
  key: string
  label: string
  items: Conversation[]
}

const groups = computed<ConversationGroup[]>(() => {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStart = startOfToday.getTime()
  const sevenDayStart = todayStart - 6 * DAY_MS
  const thirtyDayStart = todayStart - 29 * DAY_MS

  const buckets: Record<'today' | 'week' | 'month' | 'earlier', Conversation[]> = {
    today: [],
    week: [],
    month: [],
    earlier: [],
  }
  for (const conversation of store.conversations) {
    const time = conversation.updatedAt
    if (time >= todayStart) buckets.today.push(conversation)
    else if (time >= sevenDayStart) buckets.week.push(conversation)
    else if (time >= thirtyDayStart) buckets.month.push(conversation)
    else buckets.earlier.push(conversation)
  }

  const definitions: Array<{ key: keyof typeof buckets; label: string }> = [
    { key: 'today', label: '今天' },
    { key: 'week', label: '7 天内' },
    { key: 'month', label: '30 天内' },
    { key: 'earlier', label: '更早' },
  ]
  const result: ConversationGroup[] = []
  for (const definition of definitions) {
    const items = buckets[definition.key]
    if (items.length > 0) {
      result.push({ key: definition.key, label: definition.label, items })
    }
  }
  return result
})

function select(id: string): void {
  store.setActive(id)
  emit('navigated')
}

function rename(id: string, title: string): void {
  store.renameConversation(id, title)
}

function remove(id: string): void {
  store.removeConversation(id)
}
</script>

<template>
  <nav class="conv-scroll" aria-label="会话列表">
    <p v-if="store.conversations.length === 0" class="empty">
      还没有对话，点击上方「新对话」开始。
    </p>
    <template v-for="group in groups" :key="group.key">
      <div class="group-label">{{ group.label }}</div>
      <ConversationItem
        v-for="conversation in group.items"
        :key="conversation.id"
        :conversation="conversation"
        :active="conversation.id === store.activeId"
        @select="select(conversation.id)"
        @rename="(title) => rename(conversation.id, title)"
        @remove="remove(conversation.id)"
      />
    </template>
  </nav>
</template>

<style scoped>
.conv-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -6px;
  padding: 0 6px;
}

.empty {
  margin: 18px 8px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-tertiary);
}

.group-label {
  padding: 12px 8px 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
