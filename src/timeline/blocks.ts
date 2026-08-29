import type { Instant } from '../types/instant'

export interface Block {
  start: Instant
  end: Instant
}

/**
 * 事件时间序列 → 活跃块。
 * 相邻间隔 > idleGapMs 断开；零时长块给 minCreditMs 的固定信用
 * （代表一次真实交互，计 0 不诚实；但也不应让它冒充工作块）。
 */
export function toBlocks(times: Instant[], idleGapMs: number, minCreditMs: number): Block[] {
  if (times.length === 0) return []
  const sorted = [...times].sort((a, b) => a - b)

  const out: Block[] = []
  let start = sorted[0]!
  let end = sorted[0]!
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    if (cur - end > idleGapMs) {
      out.push({ start, end })
      start = cur
    }
    end = cur
  }
  out.push({ start, end })

  return out.map((b) => (b.end === b.start ? { start: b.start, end: b.start + minCreditMs } : b))
}
