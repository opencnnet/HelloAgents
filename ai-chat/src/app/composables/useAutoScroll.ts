import { nextTick, ref, type Ref } from 'vue'

const NEAR_BOTTOM_PX = 96

/** 滚动锚定：仅在用户处于底部附近时自动滚动；上滑后暂停。 */
export function useAutoScroll(container: Ref<HTMLElement | null>) {
  const pinned = ref(true)

  function onScroll(): void {
    const el = container.value
    if (!el) return
    pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  async function scrollToLatest(behavior: ScrollBehavior = 'smooth'): Promise<void> {
    await nextTick()
    const el = container.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    pinned.value = true
  }

  /** 内容更新后调用：保持贴底；用户已上滑时不做任何事。 */
  async function keepPinned(): Promise<void> {
    if (!pinned.value) return
    await nextTick()
    const el = container.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  return { pinned, onScroll, scrollToLatest, keepPinned }
}
