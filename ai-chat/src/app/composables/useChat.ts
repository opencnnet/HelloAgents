import { computed, ref } from 'vue'

import { DEFAULT_TITLE, MAX_MESSAGE_LENGTH } from '@config/app.config'
import { getTransport } from '@/adapters/transport'
import type { FinishInfo, StreamCallbacks } from '@/adapters/transport'
import { toChatError } from '@/adapters/transport/errors'
import { useConnectionStore } from '@/app/stores/connection'
import { createChatMessage, useConversationsStore } from '@/app/stores/conversations'
import { useSettingsStore } from '@/app/stores/settings'
import type { ChatError, ChatSettings } from '@/shared/types'
import { summarizeTitle } from '@/shared/utils/format'
import { buildAgentInput, buildOpenAIMessages } from '@/shared/utils/wire'

const FLUSH_INTERVAL_MS = 80

/** 模块级单例：全应用同一时刻只允许一个生成中的请求。 */
const generating = ref(false)
const streamingMessageId = ref<string | null>(null)

let controller: AbortController | null = null
let flushTimer: number | null = null
let pendingText = ''
let target: { conversationId: string; messageId: string } | null = null
let settled = false

function snapshotLabel(settings: ChatSettings): string {
  return settings.apiType === 'helloagents' ? `智能体 · ${settings.agentType}` : settings.model
}

/**
 * 多步推理时模型偶尔把同一段答案输出两遍（草稿 + 终稿拼在一起）。
 * 仅当「去掉空白后前后两段完全一致」时折叠，避免误伤正常重复用词。
 */
function collapseRepeated(text: string): string {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 40 || compact.length % 2 !== 0) return text
  const half = compact.slice(0, compact.length / 2)
  if (half !== compact.slice(compact.length / 2)) return text
  // 在原文里定位第一份结束的位置（跳过两份之间的空白）。
  let seen = 0
  for (let index = 0; index < text.length; index += 1) {
    if (!/\s/.test(text[index] ?? '')) {
      seen += 1
      if (seen === half.length) return text.slice(0, index + 1).trim()
    }
  }
  return text
}

export function useChat() {
  const conversations = useConversationsStore()
  const settingsStore = useSettingsStore()
  const connection = useConnectionStore()
  const transport = getTransport()

  const canSend = computed(() => settingsStore.isConfigured && !generating.value)

  function isActive(conversationId: string, messageId: string): boolean {
    return (
      !settled &&
      target !== null &&
      target.conversationId === conversationId &&
      target.messageId === messageId
    )
  }

  /** 增量内容节流后一次性写入 store，避免逐 token 触发 Markdown 重渲染。 */
  function flushPending(): void {
    if (!target || !pendingText) return
    const { conversationId, messageId } = target
    const message = conversations.getMessage(conversationId, messageId)
    if (!message) {
      pendingText = ''
      return
    }
    const content = message.content + pendingText
    pendingText = ''
    if (message.status === 'pending') {
      conversations.updateMessage(conversationId, messageId, { content, status: 'streaming' })
    } else {
      conversations.updateMessage(conversationId, messageId, { content })
    }
  }

  function scheduleFlush(): void {
    if (flushTimer !== null) return
    flushTimer = window.setTimeout(() => {
      flushTimer = null
      flushPending()
    }, FLUSH_INTERVAL_MS)
  }

  function maybeAutoTitle(conversationId: string): void {
    const conversation = conversations.getById(conversationId)
    if (!conversation || conversation.title !== DEFAULT_TITLE) return
    const completed = conversation.messages.filter(
      (message) =>
        message.role === 'assistant' && message.status === 'done' && message.content.trim(),
    )
    if (completed.length !== 1) return
    const title = summarizeTitle(completed[0].content)
    if (title && title !== DEFAULT_TITLE) {
      conversations.renameConversation(conversationId, title)
    }
  }

  function finish(
    conversationId: string,
    messageId: string,
    info: FinishInfo,
  ): void {
    if (!isActive(conversationId, messageId)) return
    settled = true
    flushPending()
    const message = conversations.getMessage(conversationId, messageId)
    if (!message) return
    // 空终稿不覆盖已生成的草稿，避免界面突然变空。
    const finalText = info.finalText && info.finalText.trim() ? info.finalText : undefined
    const content = collapseRepeated(finalText ?? message.content)
    conversations.updateMessage(conversationId, messageId, {
      content,
      status: 'done',
      error: null,
    })
    maybeAutoTitle(conversationId)
    if (settingsStore.isConfigured) {
      connection.markConnected(settingsStore.settings)
    }
  }

  function applyError(conversationId: string, messageId: string, error: ChatError): void {
    if (!isActive(conversationId, messageId)) return
    settled = true
    flushPending()
    const message = conversations.getMessage(conversationId, messageId)
    if (!message) return
    if (error.kind === 'aborted') {
      // 停止：保留已生成内容并标记为完成。
      conversations.updateMessage(conversationId, messageId, {
        status: 'done',
        error: message.content.trim() ? error : { ...error, message: '已停止生成。' },
      })
      return
    }
    conversations.updateMessage(conversationId, messageId, { status: 'error', error })
    connection.markError(error, settingsStore.settings)
  }

  async function runCompletion(conversationId: string, assistantMessageId: string): Promise<void> {
    const conversation = conversations.getById(conversationId)
    if (!conversation) return
    const index = conversation.messages.findIndex((message) => message.id === assistantMessageId)
    if (index < 0) return
    const history = conversation.messages.slice(0, index)
    const settings = settingsStore.settings
    const request = {
      settings,
      messages: buildOpenAIMessages(settings, history),
      agentInput: buildAgentInput(settings, history),
    }

    generating.value = true
    streamingMessageId.value = assistantMessageId
    controller = new AbortController()
    target = { conversationId, messageId: assistantMessageId }
    settled = false
    pendingText = ''

    conversations.updateMessage(conversationId, assistantMessageId, {
      content: '',
      status: 'pending',
      error: null,
      usage: null,
      activities: [],
    })

    const callbacks: StreamCallbacks = {
      onStart: () => {
        if (!isActive(conversationId, assistantMessageId)) return
        const message = conversations.getMessage(conversationId, assistantMessageId)
        if (message && message.status === 'pending') {
          conversations.updateMessage(conversationId, assistantMessageId, { status: 'streaming' })
        }
      },
      onDelta: (text) => {
        if (!isActive(conversationId, assistantMessageId)) return
        pendingText += text
        scheduleFlush()
      },
      onTool: (activity) => {
        if (!isActive(conversationId, assistantMessageId)) return
        flushPending()
        const message = conversations.getMessage(conversationId, assistantMessageId)
        if (!message) return
        const activities = [...(message.activities ?? [])]
        const existing = activities.findIndex((item) => item.id === activity.id)
        if (existing >= 0) {
          activities.splice(existing, 1, { ...activities[existing], ...activity })
        } else {
          activities.push(activity)
        }
        conversations.updateMessage(conversationId, assistantMessageId, { activities })
      },
      onUsage: (usage) => {
        if (!isActive(conversationId, assistantMessageId)) return
        conversations.updateMessage(conversationId, assistantMessageId, { usage })
      },
      onFinish: (info) => finish(conversationId, assistantMessageId, info),
      onError: (error) => applyError(conversationId, assistantMessageId, error),
    }

    try {
      await transport.streamChat(request, callbacks, controller.signal)
      if (!settled) finish(conversationId, assistantMessageId, {})
    } catch (err) {
      if (!settled) applyError(conversationId, assistantMessageId, toChatError(err))
    } finally {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer)
        flushTimer = null
      }
      flushPending()
      controller = null
      target = null
      settled = false
      generating.value = false
      streamingMessageId.value = null
      conversations.flushPersist()
    }
  }

  /** 发送新消息：追加用户消息 + AI 占位消息，再走统一的流式流程。 */
  async function send(text: string): Promise<void> {
    if (generating.value) return
    if (!settingsStore.isConfigured) return
    const content = text.trim().slice(0, MAX_MESSAGE_LENGTH)
    if (!content) return
    const settings = settingsStore.settings
    let conversation = conversations.activeConversation
    if (!conversation) {
      conversation = conversations.createConversation(snapshotLabel(settings))
    }
    const userMessage = createChatMessage('user', content)
    conversations.appendMessage(conversation.id, userMessage)
    const assistantMessage = createChatMessage('assistant', '', 'pending')
    conversations.appendMessage(conversation.id, assistantMessage)
    await runCompletion(conversation.id, assistantMessage.id)
  }

  /** 重新生成：保留用户消息，仅重建指定的 AI 消息。 */
  async function regenerate(messageId: string): Promise<void> {
    if (generating.value) return
    if (!settingsStore.isConfigured) return
    const conversation = conversations.activeConversation
    if (!conversation) return
    const message = conversation.messages.find((item) => item.id === messageId)
    if (!message || message.role !== 'assistant') return
    conversations.updateMessage(conversation.id, messageId, {
      content: '',
      status: 'pending',
      error: null,
      usage: null,
      activities: [],
    })
    await runCompletion(conversation.id, messageId)
  }

  function stop(): void {
    if (!generating.value) return
    controller?.abort()
  }

  return {
    generating,
    streamingMessageId,
    canSend,
    send,
    regenerate,
    stop,
  }
}
