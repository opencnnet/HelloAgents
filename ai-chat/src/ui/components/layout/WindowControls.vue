<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  toggleMaximizeWindow,
} from '@/adapters/window'
import { isTauri } from '@/adapters/env'
import AppIcon from '@/ui/components/common/AppIcon.vue'

/** 无边框窗口的最小化 / 最大化 / 关闭；Web 端不渲染。 */
const maximized = ref(false)

async function syncMaximized(): Promise<void> {
  maximized.value = await isWindowMaximized()
}

function onToggleMaximize(): void {
  toggleMaximizeWindow()
  void syncMaximized()
}

onMounted(() => {
  if (!isTauri) return
  void syncMaximized()
  window.addEventListener('resize', syncMaximized)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMaximized)
})
</script>

<template>
  <div v-if="isTauri" class="window-controls" role="group" aria-label="窗口控制">
    <button class="window-btn" aria-label="最小化" title="最小化" @click="minimizeWindow">
      <span class="glyph glyph-minimize"></span>
    </button>
    <button
      class="window-btn"
      :aria-label="maximized ? '还原' : '最大化'"
      :title="maximized ? '还原' : '最大化'"
      @click="onToggleMaximize"
    >
      <span :class="['glyph', maximized ? 'glyph-restore' : 'glyph-maximize']"></span>
    </button>
    <button class="window-btn window-btn-close" aria-label="关闭" title="关闭" @click="closeWindow">
      <AppIcon name="close" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
  margin-left: auto;
  flex: none;
}

.window-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 32px;
  border-radius: 6px;
  color: var(--text-secondary);
}

.window-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.window-btn-close:hover {
  background: #e5484d;
  color: #ffffff;
}

.glyph {
  position: relative;
  display: block;
  width: 10px;
  height: 10px;
}

.glyph-minimize::after {
  position: absolute;
  left: 0;
  bottom: 3px;
  width: 10px;
  height: 1px;
  background: currentColor;
  content: '';
}

.glyph-maximize {
  border: 1px solid currentColor;
}

.glyph-restore::before,
.glyph-restore::after {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid currentColor;
  content: '';
}

.glyph-restore::before {
  top: 0;
  right: 0;
}

.glyph-restore::after {
  left: 0;
  bottom: 0;
  background: var(--bg);
}
</style>
