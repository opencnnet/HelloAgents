import { nextTick, ref, watch } from 'vue'

import { COMPOSER_MAX_HEIGHT } from '@config/app.config'

/** 输入区状态：内容、高度自适应与焦点控制。 */
export function useComposer() {
  const text = ref('')
  const textareaRef = ref<HTMLTextAreaElement | null>(null)

  function resize(): void {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
  }

  watch(text, () => {
    void nextTick(resize)
  })

  function focus(): void {
    textareaRef.value?.focus()
  }

  function reset(): void {
    text.value = ''
    void nextTick(resize)
  }

  function insert(value: string): void {
    text.value = value
    void nextTick(() => {
      resize()
      focus()
    })
  }

  return { text, textareaRef, resize, focus, reset, insert }
}
