import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { DEFAULT_TITLE, STORAGE_KEYS } from '@config/app.config'
import { getStorage, StorageQuotaError } from '@/adapters/storage'
import type {
  ChatError,
  ChatMessage,
  Conversation,
  MessageRole,
  MessageStatus,
  TokenUsage,
  ToolActivity,
} from '@/shared/types'
import { createId } from '@/shared/utils/id'

const storage = getStorage()
const MESSAGE_PERSIST_DEBOUNCE_MS = 400

let persistTimer: number | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeError(value: unknown): ChatError | null {
  if (!isRecord(value)) return null
  if (typeof value.kind !== 'string' || typeof value.message !== 'string') return null
  const error: ChatError = {
    kind: value.kind as ChatError['kind'],
    message: value.message,
  }
  if (typeof value.status === 'number') error.status = value.status
  return error
}

function normalizeUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) return null
  const usage: TokenUsage = {}
  if (typeof value.promptTokens === 'number') usage.promptTokens = value.promptTokens
  if (typeof value.completionTokens === 'number') usage.completionTokens = value.completionTokens
  if (typeof value.totalTokens === 'number') usage.totalTokens = value.totalTokens
  return Object.keys(usage).length > 0 ? usage : null
}

function normalizeActivity(value: unknown): ToolActivity | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const activity: ToolActivity = {
    id: value.id,
    kind: value.kind === 'thinking' ? 'thinking' : 'tool',
    name: value.name,
    status: value.status === 'running' || value.status === 'error' ? value.status : 'done',
  }
  if (typeof value.arguments === 'string') activity.arguments = value.arguments
  if (typeof value.result === 'string') activity.result = value.result
  if (typeof value.step === 'number') activity.step = value.step
  return activity
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null
  const role = value.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null
  if (typeof value.content !== 'string') return null
  let status: MessageStatus = 'done'
  if (value.status === 'error') status = 'error'
  // 刷新后不存在进行中的请求：pending / streaming 一律视为已结束。
  return {
    id: typeof value.id === 'string' ? value.id : createId(),
    role,
    content: value.content,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    status,
    error: normalizeError(value.error),
    usage: normalizeUsage(value.usage),
    activities: Array.isArray(value.activities)
      ? value.activities
          .map(normalizeActivity)
          .filter((activity): activity is ToolActivity => activity !== null)
      : [],
  }
}

function normalizeConversation(value: unknown): Conversation | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now()
  const messages = Array.isArray(value.messages)
    ? value.messages
        .map(normalizeMessage)
        .filter((message): message is ChatMessage => message !== null)
        .filter((message) => message.role !== 'assistant' || message.content.trim().length > 0)
    : []
  return {
    id: value.id,
    title:
      typeof value.title === 'string' && value.title.trim() ? value.title.trim() : DEFAULT_TITLE,
    createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : createdAt,
    messages,
    modelSnapshot: typeof value.modelSnapshot === 'string' ? value.modelSnapshot : '',
  }
}

export function createChatMessage(
  role: MessageRole,
  content = '',
  status: MessageStatus = 'done',
): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: Date.now(),
    status,
    error: null,
    usage: null,
    activities: [],
  }
}

export const useConversationsStore = defineStore('conversations', () => {
  const conversations = ref<Conversation[]>([])
  const activeId = ref<string | null>(null)
  const loaded = ref(false)

  const activeConversation = computed<Conversation | null>(
    () => conversations.value.find((item) => item.id === activeId.value) ?? null,
  )

  function getById(id: string): Conversation | null {
    return conversations.value.find((item) => item.id === id) ?? null
  }

  function getMessage(conversationId: string, messageId: string): ChatMessage | null {
    const conversation = getById(conversationId)
    if (!conversation) return null
    return conversation.messages.find((message) => message.id === messageId) ?? null
  }

  async function persistNow(): Promise<void> {
    try {
      await storage.set(STORAGE_KEYS.conversations, conversations.value)
    } catch (err) {
      if (err instanceof StorageQuotaError) console.warn(err.message)
      else console.warn('会话保存失败：', err)
    }
  }

  /** 消息状态变化后防抖落盘；会话列表变更走 flushPersist 立即落盘。 */
  function persistSoon(): void {
    if (persistTimer !== null) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      persistTimer = null
      void persistNow()
    }, MESSAGE_PERSIST_DEBOUNCE_MS)
  }

  function flushPersist(): void {
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer)
      persistTimer = null
    }
    void persistNow()
  }

  async function persistActive(): Promise<void> {
    try {
      await storage.set(STORAGE_KEYS.activeConversation, activeId.value)
    } catch (err) {
      console.warn('当前会话保存失败：', err)
    }
  }

  async function load(): Promise<void> {
    if (loaded.value) return
    const saved = await storage.get<unknown>(STORAGE_KEYS.conversations)
    const list = Array.isArray(saved)
      ? saved.map(normalizeConversation).filter((item): item is Conversation => item !== null)
      : []
    conversations.value = list
    const savedActive = await storage.get<unknown>(STORAGE_KEYS.activeConversation)
    activeId.value =
      typeof savedActive === 'string' && list.some((item) => item.id === savedActive)
        ? savedActive
        : (list[0]?.id ?? null)
    loaded.value = true
  }

  function createConversation(modelSnapshot = ''): Conversation {
    const now = Date.now()
    const conversation: Conversation = {
      id: createId(),
      title: DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
      modelSnapshot,
    }
    conversations.value.unshift(conversation)
    activeId.value = conversation.id
    flushPersist()
    void persistActive()
    return conversation
  }

  function setActive(id: string | null): void {
    if (id !== null && !conversations.value.some((item) => item.id === id)) return
    activeId.value = id
    void persistActive()
  }

  function renameConversation(id: string, title: string): void {
    const conversation = getById(id)
    if (!conversation) return
    conversation.title = title.trim() || DEFAULT_TITLE
    flushPersist()
  }

  function removeConversation(id: string): void {
    const index = conversations.value.findIndex((item) => item.id === id)
    if (index < 0) return
    conversations.value.splice(index, 1)
    if (activeId.value === id) {
      const next = conversations.value.at(index) ?? conversations.value.at(index - 1) ?? null
      activeId.value = next ? next.id : null
      void persistActive()
    }
    flushPersist()
  }

  function appendMessage(conversationId: string, message: ChatMessage): void {
    const conversation = getById(conversationId)
    if (!conversation) return
    conversation.messages.push(message)
    conversation.updatedAt = message.createdAt
    persistSoon()
  }

  function updateMessage(
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ): void {
    const message = getMessage(conversationId, messageId)
    if (!message) return
    Object.assign(message, patch)
    persistSoon()
  }

  function touchConversation(id: string): void {
    const conversation = getById(id)
    if (!conversation) return
    conversation.updatedAt = Date.now()
    flushPersist()
  }

  async function clearAll(): Promise<void> {
    conversations.value = []
    activeId.value = null
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer)
      persistTimer = null
    }
    await Promise.allSettled([
      storage.remove(STORAGE_KEYS.conversations),
      storage.remove(STORAGE_KEYS.activeConversation),
    ])
  }

  return {
    conversations,
    activeId,
    loaded,
    activeConversation,
    getById,
    getMessage,
    load,
    createConversation,
    setActive,
    renameConversation,
    removeConversation,
    appendMessage,
    updateMessage,
    touchConversation,
    clearAll,
    flushPersist,
  }
})
