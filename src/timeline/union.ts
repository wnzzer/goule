import { MINUTE_MS, localParts, type Instant, type Tz } from '../types/instant'
import type { Block } from './blocks'

/** 区间并集。消除并行 session / subagent 重叠造成的双重计时。 */
export function union(blocks: Block[]): Block[] {
  if (blocks.length === 0) return []
  const sorted = [...blocks].sort((a, b) => a.start - b.start)

  const out: Block[] = [{ ...sorted[0]! }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = out[out.length - 1]!
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push({ ...cur })
  }
  return out
}

/** 按区间裁剪，丢弃裁剪后为空的块 */
export function clipTo(blocks: Block[], range: { start: Instant; end: Instant }): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const start = Math.max(b.start, range.start)
    const end = Math.min(b.end, range.end)
    if (end > start) out.push({ start, end })
  }
  return out
}

export function totalMinutes(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + (b.end - b.start), 0) / MINUTE_MS
}

/** 把块时长分配到 24 个本地小时桶（分钟） */
export function byHour(blocks: Block[], tz: Tz): number[] {
  const buckets = new Array<number>(24).fill(0)
  for (const b of blocks) {
    let cur = b.start
    while (cur < b.end) {
      const p = localParts(cur, tz)
      const msToNextHour = ((59 - p.minute) * 60 + (60 - p.second)) * 1000
      const next = Math.min(b.end, cur + msToNextHour)
      const step = next - cur
      if (step <= 0) { cur += MINUTE_MS; continue }   // 防御性：绝不空转
      buckets[p.hour] = (buckets[p.hour] ?? 0) + step / MINUTE_MS
      cur = next
    }
  }
  return buckets
}
