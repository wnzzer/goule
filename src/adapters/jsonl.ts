import { createReadStream } from 'node:fs'
import { parseInstant, type Instant } from '../types/instant'

/**
 * 流式逐行读取。单个 session 文件实测可达 466 MB，
 * 绝不可整体载入。
 */
export async function* readLines(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path)
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of stream) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true })
    let idx = buf.indexOf('\n')
    while (idx >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (line.trim().length > 0) yield line
      idx = buf.indexOf('\n')
    }
  }
  buf += decoder.decode()
  if (buf.trim().length > 0) yield buf
}

const TS_RE = /"timestamp":\s*"(\d{4}-\d{2}-\d{2}T[^"]{4,32})"/

/**
 * 取每行第一个 timestamp 匹配。
 * 实测：取第一个 100.00% 准确（37726/37726），取最后一个 99.97%。
 * 不做 JSON.parse —— 这是 8.7 倍性能差距的来源。
 */
export function firstTimestamp(line: string): Instant | null {
  const m = TS_RE.exec(line)
  return m?.[1] ? parseInstant(m[1]) : null
}

/**
 * 假阳性防护：正文里出现的示例时间戳可能被误匹配。
 * 提取值须落在 [文件 mtime - 30d, now + 1d] 内。
 */
export function plausible(at: Instant, mtimeMs: number): boolean {
  const lower = mtimeMs - 30 * 86_400_000
  const upper = Date.now() + 86_400_000
  return at >= lower && at <= upper
}
