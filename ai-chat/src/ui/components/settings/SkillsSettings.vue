<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createSkill,
  deleteSkill,
  listSkills,
  uploadSkill,
  type SkillSummary,
} from '@/adapters/skills'
import { useColumnResize } from '@/app/composables/useColumnResize'
import { useSettingsStore } from '@/app/stores/settings'

const settingsStore = useSettingsStore()
const { columnWidths, resizeColumn, onColumnResizeKeydown } = useColumnResize([0.9, 2.4])

/** 前两列可拖动，操作列固定宽度。 */
const tableStyle = computed(() => ({
  '--data-columns': `${columnWidths.value
    .map((width) => `minmax(0, ${width}fr)`)
    .join(' ')} 56px`,
}))
const skills = ref<SkillSummary[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

const draft = ref({ name: '', description: '', content: '' })
const overwrite = ref(false)
const zipInput = ref<HTMLInputElement | null>(null)
const zipName = ref('')

const endpoint = computed(() => settingsStore.settings.endpoint.trim())
const canImport = computed(
  () => Boolean(draft.value.name.trim()) && Boolean(draft.value.content.trim()),
)

function report(err: unknown): void {
  error.value = err instanceof Error ? err.message : String(err)
  notice.value = ''
}

async function load(): Promise<void> {
  if (!endpoint.value) return
  loading.value = true
  error.value = ''
  try {
    skills.value = await listSkills(endpoint.value)
  } catch (err) {
    report(err)
    skills.value = []
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  if (!canImport.value || busy.value) return
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    await createSkill(endpoint.value, { ...draft.value, overwrite: overwrite.value })
    notice.value = `已导入技能「${draft.value.name.trim()}」`
    draft.value = { name: '', description: '', content: '' }
    overwrite.value = false
    await load()
  } catch (err) {
    report(err)
  } finally {
    busy.value = false
  }
}

async function onZip(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) return
  zipName.value = file.name
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    await uploadSkill(endpoint.value, file, overwrite.value)
    notice.value = `已导入技能包「${file.name}」`
    zipName.value = ''
    await load()
  } catch (err) {
    report(err)
  } finally {
    busy.value = false
    if (zipInput.value) zipInput.value.value = ''
  }
}

function pickZip(): void {
  if (busy.value || !endpoint.value) return
  zipInput.value?.click()
}

async function remove(name: string): Promise<void> {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    await deleteSkill(endpoint.value, name)
    notice.value = `已删除技能「${name}」`
    await load()
  } catch (err) {
    report(err)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="form-section">
    <div class="section-heading">
      <div class="section-label">已安装技能</div>
      <button class="btn" :disabled="loading || busy" @click="load">
        {{ loading ? '刷新中…' : '刷新' }}
      </button>
    </div>

    <div v-if="!endpoint" class="hint">
      请先在「智能体」页签填写接口地址并应用，技能管理通过该地址访问后端。
    </div>
    <template v-else>
      <div v-if="skills.length === 0 && !loading" class="hint">还没有可用技能。</div>
      <div v-else class="data-table" :style="tableStyle">
        <div class="data-table-row data-table-head">
          <span
            v-for="(label, index) in ['技能', '描述', '']"
            :key="label || 'action'"
          >
            {{ label }}
            <button
              v-if="index < 2"
              class="column-resizer"
              type="button"
              role="separator"
              aria-orientation="vertical"
              :aria-label="`调整${label}列宽`"
              :title="`拖动调整${label}列宽`"
              @pointerdown="resizeColumn(index, $event)"
              @keydown="onColumnResizeKeydown(index, $event)"
            ></button>
          </span>
        </div>
        <div v-for="skill in skills" :key="skill.name" class="data-table-row">
          <span class="skill-name" :title="skill.name">{{ skill.name }}</span>
          <span class="skill-desc" :title="skill.description">
            {{ skill.description || '（无描述）' }}
          </span>
          <button
            class="skill-delete"
            :disabled="busy"
            :aria-label="`删除 ${skill.name}`"
            @click="remove(skill.name)"
          >
            删除
          </button>
        </div>
      </div>
    </template>
  </section>

  <section class="form-section">
    <div class="section-label">导入技能</div>
    <div class="field">
      <label for="skill-name">技能名称</label>
      <input
        id="skill-name"
        v-model="draft.name"
        class="input"
        placeholder="小写字母、数字、下划线或连字符"
      />
    </div>
    <div class="field">
      <label for="skill-desc">技能描述</label>
      <input
        id="skill-desc"
        v-model="draft.description"
        class="input"
        placeholder="一句话说明何时使用该技能"
      />
    </div>
    <div class="field">
      <label for="skill-content">技能内容（SKILL.md 正文）</label>
      <textarea
        id="skill-content"
        v-model="draft.content"
        class="textarea"
        rows="6"
        placeholder="## 使用步骤&#10;1. …"
      ></textarea>
    </div>
    <label class="check">
      <input v-model="overwrite" type="checkbox" />
      同名技能已存在时覆盖
    </label>
    <div class="actions">
      <button class="btn btn-primary" :disabled="!canImport || busy" @click="submit">
        {{ busy ? '导入中…' : '导入技能' }}
      </button>
    </div>
  </section>

  <section class="form-section">
    <div class="section-label">导入技能包（.zip）</div>
    <div class="hint">
      压缩包内需包含且仅包含一个 SKILL.md，同目录下的脚本、模板会一起导入。
    </div>
    <div class="file-picker">
      <button
        class="btn"
        type="button"
        :disabled="busy || !endpoint"
        @click="pickZip"
      >
        {{ busy ? '导入中…' : '选择技能包' }}
      </button>
      <span class="file-name" :title="zipName">{{ zipName || '未选择文件' }}</span>
      <input
        ref="zipInput"
        class="file-input"
        type="file"
        accept=".zip"
        :disabled="busy || !endpoint"
        @change="onZip"
      />
    </div>
  </section>

  <div v-if="error" class="notice error" role="alert">{{ error }}</div>
  <div v-else-if="notice" class="notice">{{ notice }}</div>
</template>

<style scoped>
.form-section {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-raised);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-label {
  color: var(--text-tertiary);
  font-size: 11px;
  letter-spacing: 0.1em;
  margin-bottom: 10px;
}

.section-heading .section-label {
  margin-bottom: 0;
}

.hint {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.6;
}

.skill-name,
.skill-desc {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.skill-name {
  font-weight: 600;
  color: var(--text);
}

.skill-desc {
  color: var(--text-tertiary);
}

.skill-delete {
  justify-self: end;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--text-tertiary);
  font-size: 11.5px;
}

.skill-delete:hover:not(:disabled) {
  border-color: var(--danger-line);
  background: var(--danger-wash);
  color: var(--danger);
}

.skill-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.input,
.textarea {
  width: 100%;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}

.input {
  height: 36px;
}

.textarea {
  padding: 9px 11px;
  resize: vertical;
  line-height: 1.6;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
}

.btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  border-color: var(--primary);
  background: var(--primary);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
  color: #ffffff;
}

html[data-theme='dark'] .btn-primary {
  color: #11131a;
}

.file-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.file-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.file-input {
  display: none;
}

.notice {
  padding: 9px 12px;
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 11.5px;
}

.notice.error {
  color: var(--danger);
  background: var(--danger-wash);
}
</style>
