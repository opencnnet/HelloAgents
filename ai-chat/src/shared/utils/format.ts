import { DEFAULT_TITLE } from '@config/app.config'

const two = (value: number): string => String(value).padStart(2, '0')

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 会话列表：今天显示时刻，其余显示日期。 */
export function formatListTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  if (isSameDay(date, now)) return formatTime(timestamp)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return '昨天'
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

/** 顶栏：今天 14:30 / 昨天 14:30 / 10月17日 14:30。 */
export function formatHeaderTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  if (isSameDay(date, now)) return `今天 ${formatTime(timestamp)}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return `昨天 ${formatTime(timestamp)}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatTime(timestamp)}`
}

/** 消息气泡中的时间：今天只显示时刻，更早带日期。 */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  if (isSameDay(date, now)) return formatTime(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatTime(timestamp)}`
}

/** 去掉 Markdown 标记，截取标题摘要。 */
export function summarizeTitle(text: string, maxLength = 24): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return DEFAULT_TITLE
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength)}…`
}

/** 用量展示：仅在有数据时显示。 */
export function formatUsage(totalTokens: number | undefined): string {
  if (!totalTokens || totalTokens <= 0) return ''
  return `${totalTokens.toLocaleString('zh-CN')} tokens`
}
