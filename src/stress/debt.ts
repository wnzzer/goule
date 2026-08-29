import { SIGNAL_WEIGHTS, type Signal } from './signals'

const TOTAL_WEIGHT = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0)

/**
 * 压力债：Σ weight × 0.5^(daysAgo / halfLifeDays)，归一到 0..1。
 *
 * 用半衰而非固定窗口，因为恢复是渐进的：昨天熬夜比三天前熬夜欠得多，
 * 而三天前的透支也不应在第四天突然归零。
 *
 * 归一分母取「全部信号在今天触发」的权重和，因此单日全触发恰好得 1。
 * 历史累积可能超过 1，故封顶。
 */
export function computeDebt(signals: Signal[], halfLifeDays: number): number {
  let sum = 0
  for (const s of signals) {
    if (!s.fired) continue
    const weight = SIGNAL_WEIGHTS[s.id]
    sum += weight * Math.pow(0.5, s.daysAgo / halfLifeDays)
  }
  return Math.min(1, sum / TOTAL_WEIGHT)
}
