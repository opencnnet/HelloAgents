<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from '@/ui/components/common/AppIcon.vue'
import {
  AGENT_TYPES,
  AGENT_TYPE_NAMES,
  MAX_MESSAGE_LENGTH,
} from '@config/app.config'
import type { AgentType } from '@/shared/types'
import { useChat } from '@/app/composables/useChat'
import { useComposer } from '@/app/composables/useComposer'
import { useSettingsStore } from '@/app/stores/settings'

const settingsStore = useSettingsStore()
const { generating, send, stop } = useChat()
const { text, textareaRef, resize, focus, reset, insert } = useComposer()
const agentTypeError = ref('')
const savingAgentType = ref(false)
const agentPickerRef = ref<HTMLElement | null>(null)
const agentTypeMenuOpen = ref(false)
const activeAgentTypeIndex = ref(-1)

const isConfigured = computed(() => settingsStore.isConfigured)
const enabledMcpServers = computed(() =>
  settingsStore.settings.mcpServers.filter((server) => server.enabled),
)
const mcpChipTitle = computed(() =>
  enabledMcpServers.value.length
    ? `已启用的 MCP：${enabledMcpServers.value.map((server) => server.name || '未命名').join('、')}`
    : '没有启用的 MCP 服务，可在「设置 → MCP」添加',
)
const canSubmit = computed(
  () => isConfigured.value && !generating.value && text.value.trim().length > 0,
)

async function changeAgentType(agentType: AgentType): Promise<void> {
  if (!agentType || agentType === settingsStore.settings.agentType) return
  savingAgentType.value = true
  agentTypeMenuOpen.value = false
  activeAgentTypeIndex.value = -1
  agentTypeError.value = ''
  try {
    const next = { ...settingsStore.settings, agentType }
    await settingsStore.save(next)
  } catch (err) {
    agentTypeError.value = err instanceof Error ? err.message : '保存智能体类型失败。'
  } finally {
    savingAgentType.value = false
  }
}

function toggleAgentTypeMenu(): void {
  if (generating.value || savingAgentType.value) return
  agentTypeMenuOpen.value = !agentTypeMenuOpen.value
  activeAgentTypeIndex.value = AGENT_TYPES.indexOf(settingsStore.settings.agentType)
}

function closeAgentTypeMenu(): void {
  agentTypeMenuOpen.value = false
  activeAgentTypeIndex.value = -1
}

function onAgentPickerPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node && !agentPickerRef.value?.contains(event.target)) {
    closeAgentTypeMenu()
  }
}

function onAgentPickerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeAgentTypeMenu()
    return
  }
  if (!agentTypeMenuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleAgentTypeMenu()
    }
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeAgentTypeIndex.value =
      (activeAgentTypeIndex.value + direction + AGENT_TYPES.length) % AGENT_TYPES.length
  } else if (event.key === 'Enter' && activeAgentTypeIndex.value >= 0) {
    event.preventDefault()
    const type = AGENT_TYPES[activeAgentTypeIndex.value]
    if (type) void changeAgentType(type)
  }
}

const placeholder = computed(() => {
  if (generating.value) return '正在生成回复…'
  if (!isConfigured.value) return '请先完成接口配置'
  return settingsStore.settings.apiType === 'helloagents'
    ? '问问智能体'
    : '发送消息'
})

async function submit(): Promise<void> {
  const value = text.value.trim()
  if (!value || !canSubmit.value) return
  reset()
  await send(value)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  // 中文输入法组合期间的回车只用于选词。
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}

function onStop(): void {
  stop()
}

defineExpose({ insert, focus })

onMounted(() => {
  resize()
  document.addEventListener('pointerdown', onAgentPickerPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onAgentPickerPointerDown)
})
</script>

<template>
  <div class="composer-zone">
    <div class="composer" :class="{ 'is-locked': !isConfigured }">
      <div v-if="!isConfigured" class="composer-lock">
        需要先完成接口配置才能开始对话。设置在左下角。
      </div>
      <textarea
        ref="textareaRef"
        v-model="text"
        rows="2"
        :maxlength="MAX_MESSAGE_LENGTH"
        :placeholder="placeholder"
        :disabled="!isConfigured || generating"
        @keydown="onKeydown"
      ></textarea>
      <div class="composer-foot">
        <div ref="agentPickerRef" class="agent-picker">
          <label for="composer-agent-type">智能体</label>
          <button
            id="composer-agent-type"
            type="button"
            class="agent-type-trigger"
            :disabled="generating || savingAgentType"
            :aria-expanded="agentTypeMenuOpen"
            aria-label="智能体类型"
            aria-haspopup="listbox"
            @click="toggleAgentTypeMenu"
            @keydown="onAgentPickerKeydown"
          >
            <span>{{ AGENT_TYPE_NAMES[settingsStore.settings.agentType] }}</span>
            <AppIcon name="chevron-down" :size="12" />
          </button>
          <div
            v-if="agentTypeMenuOpen"
            class="agent-type-menu"
            role="listbox"
            aria-label="智能体类型"
          >
            <button
              v-for="(type, index) in AGENT_TYPES"
              :key="type"
              type="button"
              class="agent-type-option"
              :class="{
                active: index === activeAgentTypeIndex,
                selected: type === settingsStore.settings.agentType,
              }"
              role="option"
              :aria-selected="type === settingsStore.settings.agentType"
              @mouseenter="activeAgentTypeIndex = index"
              @click="changeAgentType(type)"
            >
              <span>{{ AGENT_TYPE_NAMES[type] }}</span>
              <AppIcon
                v-if="type === settingsStore.settings.agentType"
                name="check"
                :size="14"
              />
            </button>
          </div>
        </div>
        <span
          class="mcp-chip"
          :class="{ empty: enabledMcpServers.length === 0 }"
          :title="mcpChipTitle"
        >
          MCP {{ enabledMcpServers.length }}
        </span>
        <span class="composer-count">{{ text.length }} / {{ MAX_MESSAGE_LENGTH }}</span>
        <button v-if="generating" class="stop-btn" @click="onStop">
          <i></i>
          停止生成
        </button>
        <button
          v-else
          class="send-btn"
          :disabled="!canSubmit"
          aria-label="发送"
          title="发送"
          @click="submit"
        >
          <AppIcon name="arrow-up" :size="16" />
        </button>
      </div>
      <div v-if="agentTypeError" class="agent-type-error" role="alert">
        {{ agentTypeError }}
      </div>
    </div>
    <div v-if="!isConfigured" class="composer-notice">
      请先完成连接配置，然后即可开始对话。
    </div>
  </div>
</template>

<style scoped>
.composer-zone {
  flex: none;
  padding: 10px 32px 6px;
}

.composer {
  max-width: 820px;
  margin: 0 auto;
  padding: 14px 14px 10px 18px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-raised);
  box-shadow: var(--shadow-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.composer:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(77, 107, 254, 0.12), var(--shadow-card);
}

.composer-lock {
  padding: 6px 2px 2px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

textarea {
  display: block;
  width: 100%;
  min-height: 48px;
  max-height: 168px;
  padding: 2px 2px 6px;
  border: 0;
  resize: none;
  background: transparent;
  font-size: 15px;
  line-height: 1.7;
  outline: none;
}

textarea::placeholder {
  color: var(--text-tertiary);
}

textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.composer-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
}

.agent-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  color: var(--text-tertiary);
  font-size: 11.5px;
}

.agent-type-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 112px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-raised);
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.agent-type-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-type-trigger:hover:not(:disabled),
.agent-type-trigger[aria-expanded='true'] {
  border-color: var(--border-strong);
  background: var(--bg-hover);
  color: var(--text);
}

.agent-type-trigger:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.agent-type-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-type-menu {
  position: absolute;
  z-index: 50;
  left: 0;
  bottom: calc(100% + 8px);
  width: 164px;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 11px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-dialog);
}

.agent-type-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  padding: 0 9px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
}

.agent-type-option:hover,
.agent-type-option.active {
  background: var(--bg-hover);
  color: var(--text);
}

.agent-type-option.selected {
  color: var(--primary);
}

.agent-type-option:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.agent-type-error {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--danger);
}

.composer-notice {
  margin: 8px auto 0;
  color: var(--text-tertiary);
  font-size: 11.5px;
  line-height: 1.5;
  text-align: center;
}

.composer-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.mcp-chip {
  flex: none;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  cursor: default;
}

.mcp-chip.empty {
  color: var(--text-tertiary);
  border-style: dashed;
}

.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary);
  color: #ffffff;
  transition: background 0.15s, opacity 0.15s;
}

html[data-theme='dark'] .send-btn {
  color: #11131a;
}

.send-btn:hover {
  background: var(--primary-hover);
}

.send-btn:disabled {
  background: var(--bg-soft);
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 12px;
  color: var(--text);
  background: var(--bg-raised);
}

.stop-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.stop-btn i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: currentColor;
}

.is-locked textarea {
  opacity: 0.5;
}

@media (max-width: 860px) {
  .composer-zone {
    padding: 8px 14px calc(8px + env(safe-area-inset-bottom));
  }
}
</style>
