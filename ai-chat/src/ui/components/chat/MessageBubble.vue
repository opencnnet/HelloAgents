<script setup lang="ts">
import { computed, ref } from 'vue'

import AppIcon from '@/ui/components/common/AppIcon.vue'
import BrandLogo from '@/ui/components/common/BrandLogo.vue'
import MarkdownRenderer from '@/ui/components/chat/MarkdownRenderer.vue'
import ToolActivityList from '@/ui/components/chat/ToolActivityList.vue'
import type { ChatMessage, ErrorKind } from '@/shared/types'
import { copyText } from '@/shared/utils/clipboard'
import { formatMessageTime, formatUsage } from '@/shared/utils/format'

const props = defineProps<{
  message: ChatMessage
  streaming: boolean
}>()

const emit = defineEmits<{ (event: 'regenerate'): void }>()

const copied = ref(false)

async function copyMessage(): Promise<void> {
  const ok = await copyText(props.message.content)
  if (!ok) return
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1400)
}

const showWaiting = computed(
  () => props.message.status === 'pending' && !props.message.content,
)
const showCursor = computed(
  () => props.streaming && props.message.status === 'streaming',
)
const aborted = computed(
  () => props.message.status === 'done' && props.message.error?.kind === 'aborted',
)
const canRegenerate = computed(
  () =>
    props.message.role === 'assistant' &&
    props.message.status !== 'pending' &&
    props.message.status !== 'streaming',
)
const isEmptyDone = computed(
  () =>
    props.message.role === 'assistant' &&
    props.message.status === 'done' &&
    !props.message.content.trim() &&
    !aborted.value,
)
const usageText = computed(() => formatUsage(props.message.usage?.totalTokens))

const ERROR_TITLES: Record<ErrorKind, string> = {
  network: '网络连接失败',
  auth: '鉴权失败',
  'rate-limit': '请求受限',
  server: '服务端错误',
  parser: '响应解析失败',
  aborted: '已停止',
  config: '配置不完整',
  unknown: '请求失败',
}

const errorTitle = computed(() =>
  props.message.error ? ERROR_TITLES[props.message.error.kind] : '请求失败',
)
</script>

<template>
  <article class="msg" :class="props.message.role === 'user' ? 'msg-user' : 'msg-assistant'">
    <BrandLogo
      v-if="props.message.role === 'assistant'"
      class="avatar"
      :size="28"
    />

    <div class="msg-body">
      <template v-if="props.message.role === 'user'">
        <div class="note">{{ props.message.content }}</div>
      </template>

      <template v-else>
        <ToolActivityList :activities="props.message.activities ?? []" />

        <div v-if="showWaiting" class="waiting" role="status" aria-label="等待回复">
          <i></i><i></i><i></i>
        </div>

        <div v-if="props.message.content" class="md-wrap" :class="{ 'is-streaming': showCursor }">
          <MarkdownRenderer :content="props.message.content" />
        </div>
        <p v-else-if="aborted" class="empty-reply">已停止生成</p>
        <p v-else-if="isEmptyDone" class="empty-reply">（空回复）</p>

        <div v-if="props.message.status === 'error' && props.message.error" class="error-card">
          <div class="error-head">
            <AppIcon name="alert-circle" :size="14" />
            <span>{{ errorTitle }}</span>
          </div>
          <p class="error-text">
            {{ props.message.error.message }}
            <span v-if="props.message.error.status">（HTTP {{ props.message.error.status }}）</span>
          </p>
          <button class="error-retry" @click="emit('regenerate')">
            <AppIcon name="refresh" :size="13" />
            重试
          </button>
        </div>
      </template>

      <div class="msg-meta">
        <time>{{ formatMessageTime(props.message.createdAt) }}</time>
        <span v-if="usageText" class="usage">{{ usageText }}</span>
        <span v-if="aborted" class="stopped">已停止</span>
        <button v-if="props.message.content" class="meta-action" @click="copyMessage">
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button v-if="canRegenerate" class="meta-action" @click="emit('regenerate')">
          重新生成
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.msg {
  display: flex;
  gap: 12px;
}

.msg-assistant {
  align-items: flex-start;
}

.avatar {
  width: 28px;
  height: 28px;
  margin-top: 2px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.12);
}

.msg-body {
  min-width: 0;
  max-width: 100%;
}

.msg-assistant .msg-body {
  flex: 1;
}

.msg-user {
  justify-content: flex-end;
}

.msg-user .msg-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 80%;
}

.note {
  padding: 10px 16px;
  border-radius: 16px;
  background: var(--user-bubble);
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.waiting {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 2px;
}

.waiting i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: dot-pulse 1.2s ease-in-out infinite;
}

.waiting i:nth-child(2) {
  animation-delay: 0.15s;
}

.waiting i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.md-wrap.is-streaming :deep(.md-body > :last-child::after) {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: var(--primary);
  animation: blink 1.1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

.empty-reply {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.error-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 12px 14px;
  border: 1px solid var(--danger-line);
  border-radius: 12px;
  background: var(--danger-wash);
}

.error-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--danger);
  font-weight: 600;
}

.error-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.error-retry {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border: 1px solid var(--danger-line);
  border-radius: 8px;
  font-size: 12px;
  color: var(--danger);
}

.error-retry:hover {
  background: rgba(217, 45, 32, 0.08);
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity 0.15s;
}

.msg:hover .msg-meta,
.msg:focus-within .msg-meta {
  opacity: 1;
}

.msg-user .msg-meta {
  justify-content: flex-end;
}

.usage {
  font-variant-numeric: tabular-nums;
}

.stopped {
  color: var(--primary);
}

.meta-action {
  padding: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.meta-action:hover {
  color: var(--primary);
}

@media (hover: none) {
  .msg-meta {
    opacity: 1;
  }
}
</style>
