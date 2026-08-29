import { localDate, localParts, localToInstant, pad, type Instant, type Tz } from './instant'

export interface DayRange {
  dayId: string
  start: Instant
  end: Instant
  cutoffHour: number
  tz: Tz
}

interface DayParts { year: number; month: number; day: number }

/**
 * 形状与取值双重校验。仅查正则会放行 2026-02-30 / 2026-13-01，
 * 它们经 Date.UTC 静默滚动后产生 logicalDay(r.start) !== r.dayId 的自相矛盾结构。
 * year < 1000 的拒绝是为了避开 Date.UTC 把 0–99 映射到 1900+n 的历史行为。
 */
export function parseDayId(dayId: string): DayParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId)
  if (!m) return null
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3])
  if (year < 1000) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null
  return { year, month, day }
}

function assertCutoff(cutoffHour: number): void {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new Error(`非法 cutoffHour: ${cutoffHour}（应为 0–23 的整数）`)
  }
}

/**
 * 某瞬时属于哪个逻辑日。逻辑日从本地 cutoffHour 开始。
 *
 * 必须在**墙钟空间**判断，不能写成 localDate(at - cutoffHour * HOUR_MS, tz)。
 * 后者在绝对毫秒空间做减法，而 dayRange 在墙钟空间锚定，DST 日两者会差一个
 * 跳变量：实测 445 个时区的 DST 邻近日有 160 处不一致。后果是该瞬时同时被
 * logicalDay 打上前一日标签、又落在前一日 dayRange 之外——事件凭空消失。
 */
export function logicalDay(at: Instant, cutoffHour: number, tz: Tz): string {
  const p = localParts(at, tz)
  if (p.hour >= cutoffHour) return `${p.year}-${pad(p.month)}-${pad(p.day)}`
  const prev = new Date(Date.UTC(p.year, p.month - 1, p.day - 1))
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`
}

/** dayId（YYYY-MM-DD）→ 该逻辑日的 [start, end) 区间 */
export function dayRange(dayId: string, cutoffHour: number, tz: Tz): DayRange {
  assertCutoff(cutoffHour)
  const parts = parseDayId(dayId)
  if (!parts) throw new Error(`非法 dayId: ${dayId}（应为存在的 YYYY-MM-DD 日期）`)
  const { year, month, day } = parts

  const start = localToInstant(year, month, day, cutoffHour, tz)
  // 次日：用 UTC Date 纯粹当历法计算器（自动处理跨月跨年），结果立即经
  // localToInstant 转回，不携带任何本地时间语义
  const nextUtc = new Date(Date.UTC(year, month - 1, day + 1))
  const end = localToInstant(
    nextUtc.getUTCFullYear(), nextUtc.getUTCMonth() + 1, nextUtc.getUTCDate(),
    cutoffHour, tz,
  )
  return { dayId, start, end, cutoffHour, tz }
}

/** 该逻辑日是否为周末。dayId 已是本地日期，无需时区参数。 */
export function isWeekend(dayId: string): boolean {
  const parts = parseDayId(dayId)
  if (!parts) throw new Error(`非法 dayId: ${dayId}`)
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

export { localDate }
