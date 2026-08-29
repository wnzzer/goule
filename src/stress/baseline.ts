export interface Baseline {
  handsOnP90: number
  windowDays: number
  sufficient: boolean
}

/** 线性插值分位数。空数组返回 0。 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]!
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

/**
 * 个人 hands_on 基线。
 * 用用户自己的历史分布，而非硬编码工时 —— 这是 PRD「不硬编码 996 标准」的落点。
 */
export function computeBaseline(
  dailyHandsOnMinutes: number[],
  windowDays: number,
  minDays: number,
): Baseline {
  const window = dailyHandsOnMinutes.slice(-windowDays)
  const active = window.filter((m) => m > 0)
  return {
    handsOnP90: percentile(active, 0.9),
    windowDays,
    sufficient: active.length >= minDays,
  }
}
