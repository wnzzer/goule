import { HOUR_MS, localDate, localToInstant, type Instant, type Tz } from './instant'

export interface DayRange {
  dayId: string
  start: Instant
  end: Instant
  cutoffHour: number
  tz: Tz
}

/** 某瞬时属于哪个逻辑日。逻辑日从本地 cutoffHour 开始。 */
export function logicalDay(at: Instant, cutoffHour: number, tz: Tz): string {
  return localDate(at - cutoffHour * HOUR_MS, tz)
}

/** dayId（YYYY-MM-DD）→ 该逻辑日的 [start, end) 区间 */
export function dayRange(dayId: string, cutoffHour: number, tz: Tz): DayRange {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId)
  if (!m) throw new Error(`非法 dayId: ${dayId}（应为 YYYY-MM-DD）`)
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3])

  const start = localToInstant(year, month, day, cutoffHour, tz)
  // 次日：用 UTC 算历法上的下一天，再解析回本地 cutoff
  const nextUtc = new Date(Date.UTC(year, month - 1, day + 1))
  const end = localToInstant(
    nextUtc.getUTCFullYear(), nextUtc.getUTCMonth() + 1, nextUtc.getUTCDate(),
    cutoffHour, tz,
  )
  return { dayId, start, end, cutoffHour, tz }
}

/** 该逻辑日是否为周末。dayId 已是本地日期，无需时区参数。 */
export function isWeekend(dayId: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId)
  if (!m) throw new Error(`非法 dayId: ${dayId}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}
