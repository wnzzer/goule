import { expect, test } from 'bun:test'
import { logicalDay, dayRange, isWeekend } from '../../src/types/day'
import { parseInstant, localDate, localHour } from '../../src/types/instant'

const TZ = 'Asia/Shanghai'
const CUT = 4

test('凌晨 01:20 归属前一个逻辑日', () => {
  // 北京时间 2026-08-29 01:20 → UTC 2026-08-28T17:20Z
  const at = parseInstant('2026-08-28T17:20:00Z')!
  expect(localDate(at, TZ)).toBe('2026-08-29')      // 自然日是 29
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-28') // 逻辑日是 28
})

test('上午 09:36 归属当天逻辑日', () => {
  const at = parseInstant('2026-08-29T01:36:00Z')!
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-29')
})

test('恰好 04:00 归属当天', () => {
  // 北京时间 2026-08-29 04:00 → UTC 2026-08-28T20:00Z
  const at = parseInstant('2026-08-28T20:00:00Z')!
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-29')
})

test('03:59 仍归属前一天', () => {
  const at = parseInstant('2026-08-28T19:59:00Z')!
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-28')
})

test('cutoff=0 时退化为自然日', () => {
  const at = parseInstant('2026-08-28T17:20:00Z')!
  expect(logicalDay(at, 0, TZ)).toBe('2026-08-29')
})

test('dayRange 的起止是本地 04:00，跨度 24 小时', () => {
  const r = dayRange('2026-08-28', CUT, TZ)
  expect(localDate(r.start, TZ)).toBe('2026-08-28')
  expect(localHour(r.start, TZ)).toBe(4)
  expect(localDate(r.end, TZ)).toBe('2026-08-29')
  expect(localHour(r.end, TZ)).toBe(4)
  expect(r.end - r.start).toBe(24 * 3_600_000)
})

test('dayRange 与 logicalDay 自洽：区间内任意点的逻辑日等于 dayId', () => {
  const r = dayRange('2026-08-28', CUT, TZ)
  expect(logicalDay(r.start, CUT, TZ)).toBe('2026-08-28')
  expect(logicalDay(r.end - 1, CUT, TZ)).toBe('2026-08-28')
  expect(logicalDay(r.end, CUT, TZ)).toBe('2026-08-29')
})

test('isWeekend 识别周六周日', () => {
  expect(isWeekend('2026-08-29')).toBe(true)   // 周六
  expect(isWeekend('2026-08-30')).toBe(true)   // 周日
  expect(isWeekend('2026-08-28')).toBe(false)  // 周五
  expect(isWeekend('2026-08-31')).toBe(false)  // 周一
})

test('dayRange 拒绝非法 dayId', () => {
  expect(() => dayRange('2026-8-1', CUT, TZ)).toThrow()
})
