import type { StressConfig } from '../types/config'
import type { Baseline } from './baseline'

export type SignalId =
  | 'late_night' | 'past_midnight' | 'short_recovery'
  | 'consecutive_days' | 'overlong_day' | 'weekend_work' | 'no_break_block'

export interface Signal {
  id: SignalId
  fired: boolean
  value: number
  threshold: number
  daysAgo: number
}

export interface DayInput {
  dayId: string
  handsOnMinutes: number
  lateNightMinutes: number
  crossesMidnight: boolean
  /** 前一日末锚点 → 本日首锚点的小时数；无前一日数据为 null */
  recoveryHours: number | null
  consecutiveDays: number
  isWeekend: boolean
  longestBlockMinutes: number
}

/** 各信号的债务权重。总和用于把 debt 归一到 0..1。 */
export const SIGNAL_WEIGHTS: Record<SignalId, number> = {
  late_night: 3,
  past_midnight: 2,
  short_recovery: 3,
  consecutive_days: 2,
  overlong_day: 2,
  weekend_work: 1,
  no_break_block: 1,
}

export function evaluateSignals(d: DayInput, baseline: Baseline, cfg: StressConfig): Signal[] {
  const mk = (id: SignalId, fired: boolean, value: number, threshold: number): Signal =>
    ({ id, fired, value, threshold, daysAgo: 0 })

  return [
    mk('late_night', d.lateNightMinutes > cfg.lateNightMinutes,
       d.lateNightMinutes, cfg.lateNightMinutes),

    mk('past_midnight', d.crossesMidnight, d.crossesMidnight ? 1 : 0, 1),

    mk('short_recovery',
       d.recoveryHours !== null && d.recoveryHours < cfg.shortRecoveryHours,
       d.recoveryHours ?? -1, cfg.shortRecoveryHours),

    mk('consecutive_days', d.consecutiveDays >= cfg.consecutiveDays,
       d.consecutiveDays, cfg.consecutiveDays),

    // 基线不足时该信号不参与，避免新用户被无意义基线误判
    mk('overlong_day',
       baseline.sufficient && d.handsOnMinutes > baseline.handsOnP90,
       d.handsOnMinutes, baseline.sufficient ? baseline.handsOnP90 : Infinity),

    mk('weekend_work', d.isWeekend && d.handsOnMinutes > cfg.weekendMinutes,
       d.isWeekend ? d.handsOnMinutes : 0, cfg.weekendMinutes),

    mk('no_break_block', d.longestBlockMinutes > cfg.noBreakBlockMinutes,
       d.longestBlockMinutes, cfg.noBreakBlockMinutes),
  ]
}
