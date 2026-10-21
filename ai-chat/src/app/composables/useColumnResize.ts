import { computed, onBeforeUnmount, ref } from 'vue'

const MIN_WIDTH = 0.55
const MAX_WIDTH = 4.5

/**
 * 表格列宽拖动：列宽用 fr 权重表示，返回可直接绑定到表头的样式与事件。
 * 用法：容器 `:style="tableStyle"`，表头单元格内放 `.column-resizer` 按钮。
 */
export function useColumnResize(initial: number[]) {
  const columnWidths = ref([...initial])
  let dragState: { index: number; startX: number; startWidth: number } | null = null

  const tableStyle = computed(() => ({
    '--data-columns': columnWidths.value
      .map((width) => `minmax(0, ${width}fr)`)
      .join(' '),
  }))

  function clamp(value: number): number {
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value))
  }

  function resizeColumn(index: number, event: PointerEvent): void {
    event.preventDefault()
    dragState = {
      index,
      startX: event.clientX,
      startWidth: columnWidths.value[index] ?? 0,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize, { once: true })
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragState) return
    const delta = (event.clientX - dragState.startX) / 100
    columnWidths.value[dragState.index] = clamp(dragState.startWidth + delta)
  }

  function onColumnResizeKeydown(index: number, event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 0.15 : -0.15
    columnWidths.value[index] = clamp((columnWidths.value[index] ?? 0) + delta)
  }

  function stopResize(): void {
    dragState = null
    window.removeEventListener('pointermove', onPointerMove)
  }

  onBeforeUnmount(() => {
    stopResize()
    window.removeEventListener('pointerup', stopResize)
  })

  return { columnWidths, tableStyle, resizeColumn, onColumnResizeKeydown }
}
