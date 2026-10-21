<script setup lang="ts">
import AppIcon from '@/ui/components/common/AppIcon.vue'
import type { ToolActivity } from '@/shared/types'

const props = defineProps<{ activities: ToolActivity[] }>()

function statusLabel(activity: ToolActivity): string {
  if (activity.status === 'running') return '运行中'
  if (activity.status === 'error') return '失败'
  return '完成'
}
</script>

<template>
  <div v-if="props.activities.length > 0" class="tool-list">
    <details v-for="activity in props.activities" :key="activity.id" class="tool-item">
      <summary class="tool-row">
        <AppIcon :name="activity.kind === 'thinking' ? 'thinking' : 'wrench'" :size="13" />
        <span class="tool-name">{{ activity.name }}</span>
        <span v-if="activity.step" class="tool-step">第 {{ activity.step }} 步</span>
        <span class="tool-state" :class="`is-${activity.status}`">{{ statusLabel(activity) }}</span>
        <AppIcon class="tool-chevron" name="chevron-down" :size="12" />
      </summary>
      <div v-if="activity.arguments" class="tool-detail">
        <span class="detail-label">参数</span>
        <pre>{{ activity.arguments }}</pre>
      </div>
      <div v-if="activity.result" class="tool-detail">
        <span class="detail-label">结果</span>
        <pre>{{ activity.result }}</pre>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tool-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 2px 0 12px;
}

.tool-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-raised);
  overflow: hidden;
}

.tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.tool-row::-webkit-details-marker {
  display: none;
}

.tool-row:hover {
  background: var(--bg-soft);
}

.tool-name {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text);
}

.tool-step {
  color: var(--text-tertiary);
  font-size: 11px;
}

.tool-state {
  margin-left: auto;
  font-size: 11px;
}

.tool-state.is-running {
  color: var(--primary);
}

.tool-state.is-done {
  color: var(--success);
}

.tool-state.is-error {
  color: var(--danger);
}

.tool-chevron {
  color: var(--text-tertiary);
  transition: transform 0.15s;
}

.tool-item[open] .tool-chevron {
  transform: rotate(180deg);
}

.tool-detail {
  padding: 8px 12px 10px;
  border-top: 1px dashed var(--border);
}

.detail-label {
  display: block;
  margin-bottom: 4px;
  font-size: 10.5px;
  color: var(--text-tertiary);
}

.tool-detail pre {
  margin: 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
