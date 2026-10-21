<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from '@/ui/components/common/AppIcon.vue'
import WindowControls from '@/ui/components/layout/WindowControls.vue'
import SkillsSettings from '@/ui/components/settings/SkillsSettings.vue'
import {
  AGENT_TYPES,
  AGENT_TYPE_LABELS,
  MODEL_API_TYPES,
  API_TYPE_LABELS,
  ENDPOINT_PLACEHOLDERS,
  resolveDefaultSettings,
  sanitizeSettings,
} from '@config/app.config'
import { isTauri } from '@/adapters/env'
import { getTransport } from '@/adapters/transport'
import { toChatError } from '@/adapters/transport/errors'
import { agentStreamUrl, endpointHost, modelsUrl } from '@/adapters/transport/protocol'
import { useConnectionStore } from '@/app/stores/connection'
import { useSettingsStore } from '@/app/stores/settings'
import type { ChatSettings, ModelApiType } from '@/shared/types'

type SettingsTab = 'model' | 'agent' | 'mcp' | 'skills'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>()

const settingsStore = useSettingsStore()
const connection = useConnectionStore()
const transport = getTransport()

/** 错误文案已包含状态码时不再重复追加，避免出现「（HTTP 500）。（HTTP 500）」。 */
function errorSuffix(error: { message: string; status?: number }): string {
  if (error.status === undefined) return ''
  return error.message.includes(`HTTP ${error.status}`) ? '' : `（HTTP ${error.status}）`
}

const draft = ref<ChatSettings>(sanitizeSettings(null))
const endpointRef = ref<HTMLInputElement | null>(null)
const showKey = ref(false)
const errors = ref<{ endpoint?: string; model?: string }>({})
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
const availableModels = ref<string[]>([])
const modelFetchResult = ref<{ ok: boolean; text: string } | null>(null)
const fetchingModels = ref(false)
const modelInputRef = ref<HTMLInputElement | null>(null)
const modelDropdownOpen = ref(false)
const activeModelIndex = ref(-1)
const modelDropdownStyle = ref<Record<string, string>>({})
const agentTypeButtonRef = ref<HTMLButtonElement | null>(null)
const agentTypeDropdownOpen = ref(false)
const activeAgentTypeIndex = ref(-1)
const agentTypeDropdownStyle = ref<Record<string, string>>({})
const saving = ref(false)
const saveError = ref('')
const confirmApply = ref(false)
const activeTab = ref<SettingsTab>('model')

const isAgentMode = computed(() => activeTab.value === 'agent')
const isMcpMode = computed(() => activeTab.value === 'mcp')
const isSkillsMode = computed(() => activeTab.value === 'skills')
const isModelMode = computed(() => activeTab.value === 'model')

/** Web 端建议使用页面同源地址（走 Vite 的 /agent 代理）；桌面端直连服务地址。 */
function suggestedHelloAgentsEndpoint(): string {
  return isTauri ? ENDPOINT_PLACEHOLDERS.helloagents : window.location.origin
}

const endpointPlaceholder = computed(() =>
  draft.value.apiType === 'helloagents'
    ? suggestedHelloAgentsEndpoint()
    : ENDPOINT_PLACEHOLDERS[draft.value.apiType],
)

function positionDropdown(
  anchor: HTMLElement | null,
  isOpen: boolean,
): Record<string, string> {
  if (!anchor || !isOpen) return {}
  const bounds = anchor.getBoundingClientRect()
  const margin = 8
  const below = window.innerHeight - bounds.bottom - margin
  const above = bounds.top - margin
  const openAbove = below < 150 && above > below
  const maxHeight = Math.max(96, Math.min(220, openAbove ? above : below))
  return {
    left: `${Math.max(margin, Math.min(bounds.left, window.innerWidth - bounds.width - margin))}px`,
    width: `${bounds.width}px`,
    maxHeight: `${maxHeight}px`,
    ...(openAbove
      ? { bottom: `${window.innerHeight - bounds.top + 4}px` }
      : { top: `${bounds.bottom + 4}px` }),
  }
}

function updateModelDropdownPosition(): void {
  modelDropdownStyle.value = positionDropdown(modelInputRef.value, modelDropdownOpen.value)
}

function updateAgentTypeDropdownPosition(): void {
  agentTypeDropdownStyle.value = positionDropdown(
    agentTypeButtonRef.value,
    agentTypeDropdownOpen.value,
  )
}

function openModelDropdown(): void {
  if (availableModels.value.length === 0) return
  modelDropdownOpen.value = true
  activeModelIndex.value = -1
  void nextTick(updateModelDropdownPosition)
}

function closeModelDropdown(): void {
  modelDropdownOpen.value = false
  activeModelIndex.value = -1
}

function selectModel(model: string): void {
  draft.value.model = model
  closeModelDropdown()
}

function onModelInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeModelDropdown()
    return
  }
  if (!modelDropdownOpen.value || availableModels.value.length === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeModelIndex.value = (activeModelIndex.value + 1) % availableModels.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeModelIndex.value =
      activeModelIndex.value <= 0
        ? availableModels.value.length - 1
        : activeModelIndex.value - 1
  } else if (event.key === 'Enter' && activeModelIndex.value >= 0) {
    event.preventDefault()
    const model = availableModels.value[activeModelIndex.value]
    if (model) selectModel(model)
  }
}

function toggleAgentTypeDropdown(): void {
  agentTypeDropdownOpen.value = !agentTypeDropdownOpen.value
  activeAgentTypeIndex.value = -1
  void nextTick(updateAgentTypeDropdownPosition)
}

function closeAgentTypeDropdown(): void {
  agentTypeDropdownOpen.value = false
  activeAgentTypeIndex.value = -1
}

function selectAgentType(type: ChatSettings['agentType']): void {
  draft.value.agentType = type
  closeAgentTypeDropdown()
}

function onAgentTypeKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeAgentTypeDropdown()
    return
  }
  if (!agentTypeDropdownOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleAgentTypeDropdown()
    }
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeAgentTypeIndex.value = (activeAgentTypeIndex.value + 1) % AGENT_TYPES.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeAgentTypeIndex.value =
      activeAgentTypeIndex.value <= 0
        ? AGENT_TYPES.length - 1
        : activeAgentTypeIndex.value - 1
  } else if (event.key === 'Enter' && activeAgentTypeIndex.value >= 0) {
    event.preventDefault()
    const type = AGENT_TYPES[activeAgentTypeIndex.value]
    if (type) selectAgentType(type)
  }
}

function onWindowScroll(): void {
  updateModelDropdownPosition()
  updateAgentTypeDropdownPosition()
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  const clickedTrigger = agentTypeButtonRef.value?.contains(target)
  const clickedMenu = document.getElementById('settings-agent-type-options')?.contains(target)
  if (!clickedTrigger && !clickedMenu) closeAgentTypeDropdown()
}

onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, true)
  window.addEventListener('resize', onWindowScroll)
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowScroll, true)
  window.removeEventListener('resize', onWindowScroll)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      closeAgentTypeDropdown()
      closeModelDropdown()
      return
    }
    draft.value = sanitizeSettings(settingsStore.settings)
    if (draft.value.apiType === 'anthropic' && draft.value.temperature > 1) {
      draft.value.temperature = 1
    }
    activeTab.value = draft.value.apiType === 'helloagents' ? 'agent' : 'model'
    errors.value = {}
    testing.value = false
    testResult.value = null
    availableModels.value = []
    modelFetchResult.value = null
    fetchingModels.value = false
    saveError.value = ''
    confirmApply.value = false
    showKey.value = false
    await nextTick()
    endpointRef.value?.focus()
  },
  { immediate: true },
)

watch(
  draft,
  () => {
    if (!testing.value) testResult.value = null
  },
  { deep: true },
)

watch(
  () => [draft.value.apiType, draft.value.endpoint, draft.value.apiKey] as const,
  () => {
    availableModels.value = []
    modelFetchResult.value = null
    closeModelDropdown()
    if (draft.value.apiType !== 'helloagents') closeAgentTypeDropdown()
  },
)

function close(): void {
  confirmApply.value = false
  emit('update:open', false)
}

function onModelApiTypeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if ((MODEL_API_TYPES as readonly string[]).includes(value)) {
    const apiType = value as ModelApiType
    if (apiType === draft.value.apiType) return
    saveModelConnection()
    const profile = draft.value.modelConnections[apiType]
    draft.value.apiType = apiType
    draft.value.modelConnection = { ...profile }
    draft.value.endpoint = profile.endpoint
    draft.value.apiKey = profile.apiKey
    draft.value.model = profile.model
    if (apiType === 'anthropic' && draft.value.temperature > 1) {
      draft.value.temperature = 1
    }
    errors.value = {}
  }
}

function saveModelConnection(): void {
  if (draft.value.apiType === 'helloagents') return
  const profile = {
    apiType: draft.value.apiType,
    name: draft.value.modelConnection.name,
    endpoint: draft.value.endpoint,
    apiKey: draft.value.apiKey,
    model: draft.value.model,
  }
  draft.value.modelConnection = profile
  draft.value.modelConnections[draft.value.apiType] = { ...profile }
}

function saveActiveConnection(): void {
  if (draft.value.apiType === 'helloagents') {
    draft.value.agentConnection = {
      name: draft.value.agentConnection.name,
      endpoint: draft.value.endpoint,
      apiKey: draft.value.apiKey,
    }
    return
  }
  saveModelConnection()
}

function loadConnection(mode: 'agent' | 'model'): void {
  if (mode === 'agent') {
    draft.value.apiType = 'helloagents'
    draft.value.endpoint = draft.value.agentConnection.endpoint
    draft.value.apiKey = draft.value.agentConnection.apiKey
    return
  }
  const model = draft.value.modelConnection
  draft.value.apiType = model.apiType
  draft.value.endpoint = model.endpoint
  draft.value.apiKey = model.apiKey
  draft.value.model = model.model
}

function setSettingsTab(tab: SettingsTab): void {
  if (tab === activeTab.value) return
  if (!isMcpMode.value && !isSkillsMode.value) saveActiveConnection()
  activeTab.value = tab
  if (tab === 'agent' || tab === 'model') loadConnection(tab)
  errors.value = {}
}

function addMcpServer(): void {
  const index = draft.value.mcpServers.length + 1
  draft.value.mcpServers.push({
    name: `MCP 服务 ${index}`,
    enabled: true,
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
    prefix: '',
    tools: '',
    timeout: 30,
  })
}

function removeMcpServer(index: number): void {
  draft.value.mcpServers.splice(index, 1)
}

function validate(): boolean {
  const next: { endpoint?: string; model?: string } = {}
  const endpoint = draft.value.endpoint.trim()
  if (!endpoint) next.endpoint = '请填写接口地址'
  else if (!/^https?:\/\//i.test(endpoint)) next.endpoint = '地址需以 http:// 或 https:// 开头'
  if (draft.value.apiType !== 'helloagents' && !draft.value.model.trim()) {
    next.model = '请填写模型名称'
  }
  errors.value = next
  return Object.keys(next).length === 0
}

function validateAllConnections(): boolean {
  saveActiveConnection()
  const model = draft.value.modelConnection
  if (!model.endpoint.trim() || !model.model.trim()) {
    setSettingsTab('model')
    validate()
    return false
  }
  if (!draft.value.agentConnection.endpoint.trim()) {
    setSettingsTab('agent')
    validate()
    return false
  }
  return validate()
}

/** 用当前表单里输入的值构造测试对象，避免被测到尚未载入的旧配置。 */
function draftTargetSettings(): ChatSettings {
  const target = sanitizeSettings(draft.value)
  if (isAgentMode.value) {
    target.apiType = 'helloagents'
    target.endpoint = draft.value.endpoint
    target.apiKey = draft.value.apiKey
    return target
  }
  const apiType = draft.value.modelConnection.apiType
  target.apiType = apiType
  target.endpoint = draft.value.endpoint
  target.apiKey = draft.value.apiKey
  target.model = draft.value.model
  target.modelConnection = {
    apiType,
    name: draft.value.modelConnection.name,
    endpoint: draft.value.endpoint,
    apiKey: draft.value.apiKey,
    model: draft.value.model,
  }
  return target
}

async function testConnection(): Promise<void> {
  if (testing.value || !validate()) return
  testing.value = true
  testResult.value = null
  const kind = isAgentMode.value ? 'agent' : 'model'
  const target = draftTargetSettings()
  try {
    const result = await transport.testConnection(target)
    testResult.value = { ok: true, text: `连接成功 · ${result.latencyMs} ms · ${result.host}` }
    connection.setServiceStatus(kind, {
      phase: 'connected',
      host: result.host,
      model: result.model || draft.value.model,
      latencyMs: result.latencyMs,
    })
  } catch (err) {
    const error = toChatError(err)
    const suffix = errorSuffix(error)
    const url = kind === 'agent' ? agentStreamUrl(target.endpoint) : modelsUrl(target.endpoint)
    console.warn('[settings] 连接测试失败', url, err)
    testResult.value = {
      ok: false,
      text: `连接失败（${endpointHost(target.endpoint)}）：${error.message}${suffix} · ${url}`,
    }
    connection.setServiceStatus(kind, { phase: 'error', error })
  } finally {
    testing.value = false
  }
}

async function fetchModels(): Promise<void> {
  if (fetchingModels.value || isAgentMode.value || isMcpMode.value) return
  const endpoint = draft.value.endpoint.trim()
  if (!endpoint) {
    errors.value.endpoint = '请填写接口地址'
    return
  }
  if (!/^https?:\/\//i.test(endpoint)) {
    errors.value.endpoint = '地址需以 http:// 或 https:// 开头'
    return
  }

  errors.value.endpoint = undefined
  fetchingModels.value = true
  modelFetchResult.value = null
  try {
    const models = await transport.listModels(draftTargetSettings())
    availableModels.value = models
    modelFetchResult.value = models.length
      ? { ok: true, text: `已获取 ${models.length} 个模型` }
      : { ok: false, text: '服务器未返回可用模型。' }
  } catch (err) {
    const error = toChatError(err)
    const suffix = errorSuffix(error)
    modelFetchResult.value = { ok: false, text: `获取模型失败：${error.message}${suffix}` }
  } finally {
    fetchingModels.value = false
  }
}

function restoreDefaults(): void {
  const defaults = resolveDefaultSettings()
  if (isMcpMode.value) {
    draft.value.mcpServers = defaults.mcpServers.map((server) => ({ ...server }))
  } else if (isAgentMode.value) {
    draft.value.agentConnection = { ...defaults.agentConnection }
    draft.value.endpoint = defaults.agentConnection.endpoint
    draft.value.apiKey = defaults.agentConnection.apiKey
  } else {
    const apiType = draft.value.modelConnection.apiType
    const profile = { ...defaults.modelConnections[apiType], apiType }
    draft.value.modelConnections[apiType] = profile
    draft.value.modelConnection = { ...profile }
    draft.value.apiType = apiType
    draft.value.endpoint = profile.endpoint
    draft.value.apiKey = profile.apiKey
    draft.value.model = profile.model
  }
  errors.value = {}
  testResult.value = null
  availableModels.value = []
  modelFetchResult.value = null
}

async function save(): Promise<boolean> {
  if (saving.value || !validateAllConnections()) return false
  saving.value = true
  saveError.value = ''
  try {
    // 对话固定走智能体：模型页签只提供智能体使用的大模型，MCP 也依附于智能体。
    const next = sanitizeSettings({ ...draft.value, apiType: 'helloagents' })
    await settingsStore.save(next)
    void connection.refresh(settingsStore.settings, settingsStore.isConfigured)
    return true
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : '保存失败，请重试。'
    return false
  } finally {
    saving.value = false
  }
}

function requestApply(): void {
  if (saving.value) return
  if (!validateAllConnections()) {
    saveError.value = '请先补全模型与智能体的接口配置，再点击应用。'
    return
  }
  saveError.value = ''
  confirmApply.value = true
}

async function confirmAndApply(): Promise<void> {
  confirmApply.value = false
  await save()
}
</script>

<template>
  <main
    v-if="props.open"
    class="settings-page"
    aria-labelledby="settings-title"
    @keydown.esc.stop="close"
  >
    <header class="dialog-head settings-head" data-tauri-drag-region>
      <div data-tauri-drag-region>
        <div id="settings-title" class="dialog-title" data-tauri-drag-region>设置</div>
        <div class="dialog-sub" data-tauri-drag-region>配置只保存在本机，不会上传。</div>
      </div>
      <WindowControls />
    </header>

    <div class="dialog-body settings-body">
            <section class="form-section tabs-section">
              <div class="segmented connection-mode" role="group" aria-label="配置项">
                <button
                  :class="{ active: isAgentMode }"
                  @click="setSettingsTab('agent')"
                >
                  智能体
                </button>
                <button
                  :class="{ active: isModelMode }"
                  @click="setSettingsTab('model')"
                >
                  模型
                </button>
                <button
                  :class="{ active: isMcpMode }"
                  @click="setSettingsTab('mcp')"
                >
                  MCP
                </button>
                <button
                  :class="{ active: isSkillsMode }"
                  @click="setSettingsTab('skills')"
                >
                  技能
                </button>
              </div>
              <div class="help segment-help">
                模型配置供智能体调用，MCP 工具与技能也由智能体加载；应用前需要分别配置模型和智能体。
              </div>
            </section>

            <section v-if="!isMcpMode && !isSkillsMode" class="form-section">
              <div class="form-section-label">接口</div>

              <div v-if="!isAgentMode" class="field">
                <label for="settings-model-api-type">模型服务类型</label>
                <div class="select-wrap">
                  <select
                    id="settings-model-api-type"
                    class="select"
                    :value="draft.apiType"
                    @change="onModelApiTypeChange"
                  >
                    <option v-for="type in MODEL_API_TYPES" :key="type" :value="type">
                      {{ API_TYPE_LABELS[type] }}
                    </option>
                  </select>
                </div>
              </div>

              <div v-if="isAgentMode" class="field">
                <label for="settings-agent-name">智能体名称</label>
                <input
                  id="settings-agent-name"
                  v-model="draft.agentConnection.name"
                  class="input"
                  maxlength="80"
                  placeholder="本地智能体"
                />
                <div class="help">用于在连接状态中区分智能体服务。</div>
              </div>

              <div v-else class="field">
                <label for="settings-model-name">模型别名</label>
                <input
                  id="settings-model-name"
                  v-model="draft.modelConnection.name"
                  class="input"
                  maxlength="80"
                  placeholder="例如：工作用 Claude"
                />
                <div class="help">为这份大模型配置起一个易识别的名字，用于连接状态展示。</div>
              </div>

              <div class="field">
                <label for="settings-endpoint">接口地址</label>
                <input
                  id="settings-endpoint"
                  ref="endpointRef"
                  v-model="draft.endpoint"
                  class="input"
                  :placeholder="endpointPlaceholder"
                  autocomplete="off"
                  spellcheck="false"
                />
                <div v-if="errors.endpoint" class="field-error">{{ errors.endpoint }}</div>
                <div v-else-if="isAgentMode" class="help">
                  请求将发送到 /agent/stream；开发/预览时填写本页面地址即可走内置代理，桌面端填写
                  HelloAgents 智能体服务地址。
                </div>
                <div v-else class="help">
                  <template v-if="draft.apiType === 'anthropic'">
                    填写 Anthropic API 基础地址（默认 https://api.anthropic.com，可带或不带 /v1），
                    请求使用 /v1/messages；模型列表从 /v1/models 获取。
                  </template>
                  <template v-else>
                    填写 OpenAI 兼容接口的基础地址（通常以 /v1 结尾），请求会发往
                    /chat/completions。
                  </template>
                </div>
              </div>

              <div v-if="isAgentMode" class="field">
                <label for="settings-agent-key">智能体服务 API Key（可选）</label>
                <div class="input-group">
                  <input
                    id="settings-agent-key"
                    v-model="draft.apiKey"
                    class="input"
                    :type="showKey ? 'text' : 'password'"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button
                    class="input-suffix"
                    :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
                    :title="showKey ? '隐藏密钥' : '显示密钥'"
                    @click="showKey = !showKey"
                  >
                    <AppIcon :name="showKey ? 'eye-off' : 'eye'" :size="15" />
                  </button>
                </div>
              </div>

              <div v-else class="field">
                <label for="settings-key">
                  {{ draft.apiType === 'anthropic' ? 'Anthropic API Key' : 'API Key' }}
                </label>
                <div class="input-group">
                  <input
                    id="settings-key"
                    v-model="draft.apiKey"
                    class="input"
                    :type="showKey ? 'text' : 'password'"
                    placeholder="sk-…"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button
                    class="input-suffix"
                    :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
                    :title="showKey ? '隐藏密钥' : '显示密钥'"
                    @click="showKey = !showKey"
                  >
                    <AppIcon :name="showKey ? 'eye-off' : 'eye'" :size="15" />
                  </button>
                </div>
                <div class="help">
                  {{
                    draft.apiType === 'local'
                      ? '本地服务通常无需密钥，可留空。'
                      : draft.apiType === 'anthropic'
                        ? '通过 x-api-key 请求头发送；密钥只保存在本机。'
                        : '密钥只保存在本机。'
                  }}
                </div>
              </div>

              <div v-if="!isAgentMode" class="field">
                <div class="field-label-row">
                  <label for="settings-model">模型名称</label>
                  <button
                    class="model-fetch-btn"
                    :disabled="fetchingModels"
                    @click="fetchModels"
                  >
                    {{ fetchingModels ? '获取中…' : '从服务器获取' }}
                  </button>
                </div>
                <input
                  id="settings-model"
                  ref="modelInputRef"
                  v-model="draft.model"
                  class="input"
                  placeholder="选择或输入模型名称"
                  autocomplete="off"
                  spellcheck="false"
                  role="combobox"
                  :aria-expanded="modelDropdownOpen"
                  aria-controls="settings-model-options"
                  aria-autocomplete="list"
                  @focus="openModelDropdown"
                  @click="openModelDropdown"
                  @blur="closeModelDropdown"
                  @keydown="onModelInputKeydown"
                />
                <Teleport to="body">
                  <div
                    v-if="modelDropdownOpen && availableModels.length"
                    id="settings-model-options"
                    class="model-dropdown"
                    role="listbox"
                    :style="modelDropdownStyle"
                  >
                    <button
                      v-for="(model, index) in availableModels"
                      :key="model"
                      type="button"
                      class="model-option"
                      :class="{ active: index === activeModelIndex, selected: model === draft.model }"
                      role="option"
                      :aria-selected="model === draft.model"
                      @mousedown.prevent="selectModel(model)"
                      @mouseenter="activeModelIndex = index"
                    >
                      {{ model }}
                    </button>
                  </div>
                </Teleport>
                <div v-if="errors.model" class="field-error">{{ errors.model }}</div>
                <div
                  v-else-if="modelFetchResult"
                  class="model-fetch-result"
                  :class="{ fail: !modelFetchResult.ok }"
                >
                  {{ modelFetchResult.text }}
                </div>
                <div v-else class="help">
                  点击“从服务器获取”加载可用模型，也可以手动输入名称。
                </div>
              </div>

              <div v-else class="field">
                <label for="settings-agent-type">智能体类型</label>
                <div class="select-wrap">
                  <button
                    id="settings-agent-type"
                    ref="agentTypeButtonRef"
                    type="button"
                    class="select agent-type-trigger"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-controls="settings-agent-type-options"
                    :aria-expanded="agentTypeDropdownOpen"
                    @click="toggleAgentTypeDropdown"
                    @keydown="onAgentTypeKeydown"
                  >
                    <span>{{ AGENT_TYPE_LABELS[draft.agentType] }}</span>
                  </button>
                </div>
                <Teleport to="body">
                  <div
                    v-if="agentTypeDropdownOpen"
                    id="settings-agent-type-options"
                    class="model-dropdown"
                    role="listbox"
                    :style="agentTypeDropdownStyle"
                  >
                    <button
                      v-for="(type, index) in AGENT_TYPES"
                      :key="type"
                      type="button"
                      class="model-option"
                      :class="{
                        active: index === activeAgentTypeIndex,
                        selected: type === draft.agentType,
                      }"
                      role="option"
                      :aria-selected="type === draft.agentType"
                      @mousedown.prevent="selectAgentType(type)"
                      @mouseenter="activeAgentTypeIndex = index"
                    >
                      {{ AGENT_TYPE_LABELS[type] }}
                    </button>
                  </div>
                </Teleport>
              </div>

              <div class="test-row">
                <button class="btn" :disabled="testing" @click="testConnection">
                  <span v-if="testing" class="spinner"></span>
                  {{ testing ? '正在测试…' : '测试连接' }}
                </button>
                <button
                  class="btn"
                  title="仅恢复当前页签的默认配置"
                  @click="restoreDefaults"
                >
                  恢复默认
                </button>
                <span
                  v-if="testResult"
                  class="test-result"
                  :class="{ fail: testResult ? !testResult.ok : false }"
                >
                  {{ testResult.text }}
                </span>
              </div>
            </section>

            <section v-if="isModelMode" class="form-section">
              <div class="form-section-label">生成参数</div>

              <div class="field">
                <label>Temperature</label>
                <div class="slider-row">
                  <input
                    v-model.number="draft.temperature"
                    type="range"
                    min="0"
                    :max="draft.apiType === 'anthropic' ? 1 : 2"
                    step="0.1"
                    aria-label="Temperature"
                  />
                  <input
                    v-model.number="draft.temperature"
                    class="slider-num"
                    type="number"
                    min="0"
                    :max="draft.apiType === 'anthropic' ? 1 : 2"
                    step="0.1"
                    aria-label="Temperature 数值"
                  />
                </div>
              </div>

              <div class="field">
                <label>Top P</label>
                <div class="slider-row">
                  <input
                    v-model.number="draft.topP"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    aria-label="Top P"
                  />
                  <input
                    v-model.number="draft.topP"
                    class="slider-num"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    aria-label="Top P 数值"
                  />
                </div>
              </div>

              <div class="field">
                <label for="settings-max-tokens">最大输出 Tokens</label>
                <input
                  id="settings-max-tokens"
                  v-model.number="draft.maxTokens"
                  class="input"
                  type="number"
                  min="1"
                  max="131072"
                  step="1"
                />
              </div>
            </section>

            <section v-if="isModelMode" class="form-section">
              <div class="form-section-label">请求选项</div>
              <div class="field">
                <label for="settings-system-prompt">系统提示词</label>
                <textarea
                  id="settings-system-prompt"
                  v-model="draft.systemPrompt"
                  class="textarea"
                  rows="3"
                  placeholder="可选：为每次对话附加的系统指令"
                ></textarea>
              </div>

              <div class="field switch-row">
                <div>
                  <label class="inline-label">流式输出</label>
                  <div class="help">关闭后等待完整回复再一次性显示。</div>
                </div>
                <label class="switch">
                  <input v-model="draft.streaming" type="checkbox" />
                  <i></i>
                  <span class="sr-only">流式输出</span>
                </label>
              </div>
            </section>

            <section v-if="!isMcpMode && !isSkillsMode" class="form-section">
              <div class="form-section-label">对话上下文</div>
              <div class="field">
                <label for="settings-context-turns">保留历史轮数</label>
                <input
                  id="settings-context-turns"
                  v-model.number="draft.contextTurns"
                  class="input"
                  type="number"
                  min="0"
                  max="50"
                  step="1"
                />
                <div class="help">
                  {{
                    isAgentMode
                      ? '由客户端整理最近的对话记录后发送给智能体服务；不属于模型生成参数。'
                      : '由客户端决定发送给模型的历史对话轮数；不属于模型生成参数。'
                  }}
                </div>
              </div>
            </section>

            <section v-if="isMcpMode" class="form-section">
              <div class="form-section-heading">
                <div class="form-section-label">MCP 服务</div>
                <button class="btn" @click="addMcpServer">添加服务</button>
              </div>
              <div class="help mcp-integration-note">
                启用中的服务会随聊天请求发送给后端，由后端按需启动本地进程或连接远程地址，并把工具注入智能体。
              </div>
              <div v-if="draft.mcpServers.length === 0" class="mcp-empty">
                尚未添加 MCP 服务。
              </div>
              <div
                v-for="(server, index) in draft.mcpServers"
                :key="index"
                class="mcp-server"
              >
                <div class="mcp-server-heading">
                  <strong>{{ server.name || `MCP 服务 ${index + 1}` }}</strong>
                  <div class="mcp-server-actions">
                    <label class="mcp-enabled">
                      <input v-model="server.enabled" type="checkbox" />
                      启用
                    </label>
                    <button
                      class="btn btn-danger"
                      :aria-label="`删除 ${server.name || `MCP 服务 ${index + 1}`}`"
                      @click="removeMcpServer(index)"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div class="field-row">
                  <div class="field">
                    <label :for="`mcp-name-${index}`">服务名称</label>
                    <input
                      :id="`mcp-name-${index}`"
                      v-model="server.name"
                      class="input"
                      placeholder="例如：filesystem"
                    />
                  </div>
                  <div class="field">
                    <label :for="`mcp-transport-${index}`">传输方式</label>
                    <div class="select-wrap">
                      <select
                        :id="`mcp-transport-${index}`"
                        v-model="server.transport"
                        class="select"
                      >
                        <option value="stdio">stdio（本地命令）</option>
                        <option value="streamable-http">Streamable HTTP</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div v-if="server.transport === 'stdio'" class="field">
                  <label :for="`mcp-command-${index}`">启动命令</label>
                  <input
                    :id="`mcp-command-${index}`"
                    v-model="server.command"
                    class="input"
                    placeholder="例如：python"
                  />
                  <div class="help">
                    参数按每行一个填写，不经过 Shell 解析。命令可写相对路径，相对于后端服务的工作目录（通常是仓库根目录）。
                  </div>
                  <textarea
                    v-model="server.args"
                    class="textarea"
                    rows="2"
                    :aria-label="`${server.name || `MCP 服务 ${index + 1}`} 启动参数`"
                    placeholder="-m&#10;my_mcp_server"
                  ></textarea>
                </div>
                <div v-else class="field">
                  <label :for="`mcp-url-${index}`">服务地址</label>
                  <input
                    :id="`mcp-url-${index}`"
                    v-model="server.url"
                    class="input"
                    type="url"
                    placeholder="https://example.com/mcp"
                  />
                </div>
                <div class="field-row">
                  <div class="field">
                    <label :for="`mcp-prefix-${index}`">工具名称前缀</label>
                    <input
                      :id="`mcp-prefix-${index}`"
                      v-model="server.prefix"
                      class="input"
                      placeholder="例如：files_"
                    />
                  </div>
                  <div class="field">
                    <label :for="`mcp-timeout-${index}`">连接超时（秒）</label>
                    <input
                      :id="`mcp-timeout-${index}`"
                      v-model.number="server.timeout"
                      class="input"
                      type="number"
                      min="1"
                      max="300"
                      step="1"
                    />
                  </div>
                </div>
                <div class="field">
                  <label :for="`mcp-tools-${index}`">允许使用的工具</label>
                  <textarea
                    :id="`mcp-tools-${index}`"
                    v-model="server.tools"
                    class="textarea"
                    rows="2"
                    placeholder="每行填写一个工具名；留空表示允许全部工具"
                  ></textarea>
                </div>
              </div>
            </section>

            <SkillsSettings v-if="isSkillsMode" />
    </div>

    <div class="dialog-foot">
            <span v-if="saveError" class="save-error">{{ saveError }}</span>
            <button class="btn" @click="close">取消</button>
            <button class="btn btn-primary" :disabled="saving" @click="requestApply">
              {{ saving ? '应用中…' : '应用' }}
            </button>
    </div>

    <div v-if="confirmApply" class="confirm-overlay">
            <div
              class="confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-apply-title"
              aria-describedby="confirm-apply-description"
            >
              <div id="confirm-apply-title" class="confirm-title">确认应用设置？</div>
              <p id="confirm-apply-description" class="confirm-description">
                设置将保存在本机，并应用于后续请求。
              </p>
              <div class="confirm-actions">
                <button class="btn" :disabled="saving" @click="confirmApply = false">取消</button>
                <button class="btn btn-primary" :disabled="saving" @click="confirmAndApply">
                  确认
                </button>
              </div>
            </div>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--bg);
  overflow: hidden;
}

.dialog-head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  flex: none;
}

.dialog-title {
  font-size: 17px;
  font-weight: 650;
}

.dialog-sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--text-tertiary);
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 22px 28px 28px;
  box-sizing: border-box;
}

.form-section {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-raised);
}

.form-section-label {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.form-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.form-section-heading .form-section-label {
  margin-bottom: 0;
}

.mcp-integration-note {
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--bg-soft);
}

.mcp-empty {
  padding: 16px 4px 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.mcp-server {
  padding: 14px 12px 2px;
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}

.mcp-server-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.mcp-server-heading strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcp-server-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.mcp-enabled {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-secondary);
}

.field {
  margin-bottom: 13px;
}

.field > label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}

.field-label-row label {
  font-size: 12px;
  color: var(--text-secondary);
}

.model-fetch-btn {
  padding: 2px 0;
  color: var(--primary);
  font-size: 11px;
}

.model-fetch-btn:hover:not(:disabled) {
  color: var(--primary-hover);
}

.model-fetch-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-fetch-result {
  margin-top: 4px;
  font-size: 11px;
  color: var(--success);
}

.model-fetch-result.fail {
  color: var(--danger);
}

.inline-label {
  display: inline-block;
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.help {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.field-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--danger);
}

.input,
.select {
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  font-size: 13px;
  color: var(--text);
}

.select {
  appearance: none;
  padding-right: 34px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.agent-type-trigger {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  text-align: left;
  font-family: inherit;
}

.select-wrap {
  position: relative;
}

.select-wrap::after {
  content: '';
  position: absolute;
  top: 12px;
  right: 14px;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid var(--text-tertiary);
  border-bottom: 1.5px solid var(--text-tertiary);
  transform: rotate(45deg);
  pointer-events: none;
}

.select:hover {
  border-color: var(--border-strong);
}

.select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(77, 107, 254, 0.12);
}

.select option {
  background: var(--bg-raised);
  color: var(--text);
}

.model-dropdown {
  position: fixed;
  z-index: 100;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-dialog);
  color: var(--text);
  overscroll-behavior: contain;
}

.model-option {
  display: block;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12.5px;
  text-align: left;
  overflow-wrap: anywhere;
}

.model-option:hover,
.model-option.active {
  background: var(--bg-hover);
  color: var(--text);
}

.model-option.selected {
  color: var(--primary);
}

.textarea {
  width: 100%;
  min-height: 68px;
  padding: 9px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  resize: vertical;
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(77, 107, 254, 0.12);
}

.input-group {
  position: relative;
}

.input-group .input {
  padding-right: 38px;
}

.input-suffix {
  position: absolute;
  top: 0;
  right: 0;
  height: 36px;
  width: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-radius: 0 10px 10px 0;
}

.input-suffix:hover {
  color: var(--text);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-soft);
}

.connection-mode {
  display: grid;
  /* 列数由页签数量决定，始终单行平铺。 */
  grid-template-columns: none;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 2px;
  padding: 2px;
}

.segmented.connection-mode button {
  height: 26px;
  padding: 0 12px;
}

.tabs-section {
  padding: 12px 14px;
}

.segment-help {
  margin-top: 6px;
}

.model-provider {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.segmented button {
  height: 28px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.segmented button:hover:not(.active) {
  background: var(--bg-hover);
}

.segmented button:focus-visible,
.model-fetch-btn:focus-visible,
.model-option:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.segmented button.active {
  background: var(--bg-raised);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08), 0 0 0 1px var(--border);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-row input[type='range'] {
  flex: 1;
  accent-color: var(--primary);
}

.slider-num {
  width: 64px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-secondary);
  text-align: center;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.switch {
  position: relative;
  width: 38px;
  height: 22px;
  flex: none;
  cursor: pointer;
}

.switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.switch i {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background 0.15s;
  pointer-events: none;
}

.switch i::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg-raised);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: transform 0.15s;
}

.switch input:checked + i {
  background: var(--primary);
}

.switch input:checked + i::after {
  transform: translateX(16px);
}

.test-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.test-result {
  font-size: 11.5px;
  color: var(--success);
}

.test-result.fail {
  color: var(--danger);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 15px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  font-size: 12.5px;
  color: var(--text);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
  color: #ffffff;
}

html[data-theme='dark'] .btn-primary {
  color: #11131a;
}

.btn-danger {
  border-color: var(--danger-line);
  color: var(--danger);
  flex: none;
}

.btn-danger:hover,
.btn-danger.armed {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-wash);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--text-tertiary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px max(24px, calc((100% - 864px) / 2));
  border-top: 1px solid var(--border);
  background: var(--bg-raised);
}

.dialog-foot .btn {
  height: 34px;
  padding: 0 16px;
}

.confirm-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--overlay);
}

.confirm-dialog {
  width: min(360px, 100%);
  padding: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-dialog);
}

.confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.confirm-description {
  margin: 8px 0 20px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.save-error {
  margin-right: auto;
  font-size: 11.5px;
  color: var(--danger);
}

html[data-theme='dark'] .icon-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

@media (max-width: 640px) {
  .dialog-head {
    min-height: 58px;
    padding: 0 14px;
  }

  .dialog-body {
    padding: 14px;
    gap: 10px;
  }

  .form-section {
    padding: 14px;
  }

  .dialog-foot {
    padding: 10px 14px;
  }

  .field-row {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .segmented:not(.connection-mode) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .segmented.connection-mode button {
    padding: 0 8px;
  }

  .model-provider {
    grid-template-columns: 1fr;
  }
}
</style>
