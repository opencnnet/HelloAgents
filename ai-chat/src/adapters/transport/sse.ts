/**
 * SSE 帧解析：与传输方式无关的纯函数，便于单独测试。
 * 只负责按帧边界切分与字段提取，不解释 data 的业务含义。
 */
export interface SseFrame {
  event?: string
  data: string
  id?: string
}

export interface SseParseResult {
  frames: SseFrame[]
  /** 尚未收完整、需要与下一段数据拼接的残余内容 */
  rest: string
}

function parseBlock(block: string): SseFrame | null {
  if (!block.trim()) return null
  let event: string | undefined
  let id: string | undefined
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    // 注释行（以 : 开头）与空行不参与数据拼接。
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
    else if (field === 'id') id = value
  }
  if (dataLines.length === 0) return null
  const frame: SseFrame = { data: dataLines.join('\n') }
  if (event !== undefined) frame.event = event
  if (id !== undefined) frame.id = id
  return frame
}

/**
 * 增量解析缓冲区。
 * @param buffer 已累计的文本（含上次返回的 rest）
 * @param flush  流结束时传 true，把残余内容当作最后一帧处理
 */
export function parseSseBuffer(buffer: string, flush = false): SseParseResult {
  const normalized = buffer.replace(new RegExp('^\\uFEFF'), '').replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = flush ? '' : (blocks.pop() ?? '')
  const frames: SseFrame[] = []
  for (const block of blocks) {
    const frame = parseBlock(block)
    if (frame) frames.push(frame)
  }
  return { frames, rest }
}
