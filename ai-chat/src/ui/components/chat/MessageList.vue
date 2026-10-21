<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import AppIcon from '@/ui/components/common/AppIcon.vue'
import MessageBubble from '@/ui/components/chat/MessageBubble.vue'
import { useAutoScroll } from '@/app/composables/useAutoScroll'
import { useChat } from '@/app/composables/useChat'
import { useConversationsStore } from '@/app/stores/conversations'
import { useSettingsStore } from '@/app/stores/settings'

const emit = defineEmits<{ (event: 'suggest', text: string): void }>()

const conversations = useConversationsStore()
const settingsStore = useSettingsStore()
const { generating, streamingMessageId, regenerate } = useChat()

const scroller = ref<HTMLElement | null>(null)
const { pinned, onScroll, scrollToLatest, keepPinned } = useAutoScroll(scroller)

const messages = computed(() => conversations.activeConversation?.messages ?? [])
const isConfigured = computed(() => settingsStore.isConfigured)

/** 轻量修订号：内容长度 / 状态 / 工具数量变化时触发贴底滚动。 */
const revision = computed(() =>
  messages.value
    .map(
      (message) =>
        `${message.id}:${message.status}:${message.content.length}:${message.activities?.length ?? 0}`,
    )
    .join('|'),
)

watch(revision, () => {
  void keepPinned()
})

watch(
  () => conversations.activeId,
  () => {
    void scrollToLatest('auto')
  },
)

onMounted(() => {
  void scrollToLatest('auto')
})

const SUGGESTIONS = [
  '介绍一下 HelloAgents 的架构',
  '帮我写一个 ReAct Agent 示例',
  '解释一下流式事件的用法',
]
const SUGGESTION_ICONS = ['thinking', 'wrench', 'menu'] as const

function onRegenerate(messageId: string): void {
  void regenerate(messageId)
}
</script>

<template>
  <div class="thread-wrap">
    <div ref="scroller" class="thread" @scroll.passive="onScroll">
      <div v-if="messages.length > 0" class="thread-inner">
        <MessageBubble
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :streaming="generating && streamingMessageId === message.id"
          @regenerate="onRegenerate(message.id)"
        />
      </div>

      <div v-else class="empty-state">
        <h1 class="empty-title">有什么可以帮忙的？</h1>
        <p v-if="isConfigured" class="empty-sub">向 HelloAgents 提问，开始一段新对话</p>
        <p v-else class="empty-sub">
          先在左下角完成接口配置，然后开始对话。配置入口在侧边栏底部。
        </p>
        <div v-if="isConfigured" class="empty-chips">
          <button
            v-for="item in SUGGESTIONS"
            :key="item"
            class="chip"
            @click="emit('suggest', item)"
          >
            <AppIcon :name="SUGGESTION_ICONS[SUGGESTIONS.indexOf(item)]" :size="15" />
            {{ item }}
            <AppIcon class="chip-arrow" name="arrow-up" :size="13" />
          </button>
        </div>
      </div>
    </div>

    <transition name="fade">
      <button
        v-if="!pinned && messages.length > 0"
        class="jump-latest"
        @click="scrollToLatest()"
      >
        <AppIcon name="arrow-down" :size="12" />
        回到最新
      </button>
    </transition>
  </div>
</template>

<style scoped>
.thread-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}

.thread {
  height: 100%;
  overflow-y: auto;
}

.thread-inner {
  max-width: 820px;
  margin: 0 auto;
  padding: 22px 32px 12px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.empty-state {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: clamp(140px, 25vh, 230px) 24px 220px;
  text-align: center;
}

.empty-title {
  margin: 0;
  font-size: 27px;
  font-weight: 550;
  letter-spacing: -0.025em;
}

.empty-sub {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-tertiary);
}

.empty-chips {
  position: absolute;
  top: 59%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100% - 48px));
  transform: translateX(-50%);
}

.chip {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: left;
}

.chip:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.chip-arrow {
  margin-left: auto;
  transform: rotate(45deg);
  opacity: 0;
}

.chip:hover .chip-arrow {
  opacity: 0.65;
}

.jump-latest {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-card);
  font-size: 12px;
  color: var(--text-secondary);
}

.jump-latest:hover {
  color: var(--primary);
  border-color: var(--primary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 4px);
}

@media (max-width: 860px) {
  .thread-inner {
    padding: 16px 18px 8px;
  }

  .empty-state {
    padding-top: 19vh;
  }

  .empty-title {
    font-size: 23px;
  }

  .empty-chips {
    top: 57%;
    width: calc(100% - 24px);
  }
}
</style>
