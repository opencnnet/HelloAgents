<script setup lang="ts">
import { computed } from 'vue'

import { copyText } from '@/shared/utils/clipboard'
import { renderMarkdown } from '@/shared/utils/markdown'

const props = defineProps<{ content: string }>()

const html = computed(() => renderMarkdown(props.content))

/** 代码块复制：v-html 内容通过事件委托处理。 */
async function onClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement | null
  const button = target?.closest<HTMLButtonElement>('[data-copy-code]')
  if (!button) return
  const block = button.closest('.code-block')
  const code = block?.querySelector('code')?.textContent ?? ''
  const ok = await copyText(code)
  const original = button.textContent ?? '复制'
  button.textContent = ok ? '已复制' : '复制失败'
  window.setTimeout(() => {
    button.textContent = original
  }, 1400)
}
</script>

<template>
  <div class="md-body" @click="onClick" v-html="html"></div>
</template>
