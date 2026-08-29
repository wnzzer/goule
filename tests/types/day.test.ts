import { describe, expect, test } from 'bun:test'
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

test('dayRange 拒绝形状非法的 dayId', () => {
  expect(() => dayRange('2026-8-1', CUT, TZ)).toThrow(/非法 dayId/)
})

test('dayRange 拒绝取值非法的 dayId，而非静默滚动', () => {
  // 仅查正则会放行这些，Date.UTC 静默滚动后产生自相矛盾的 DayRange
  expect(() => dayRange('2026-02-30', CUT, TZ)).toThrow(/非法 dayId/)
  expect(() => dayRange('2026-13-01', CUT, TZ)).toThrow(/非法 dayId/)
  expect(() => dayRange('2026-00-10', CUT, TZ)).toThrow(/非法 dayId/)
  expect(() => dayRange('0099-01-01', CUT, TZ)).toThrow(/非法 dayId/)
})

test('dayRange 拒绝非法 cutoffHour', () => {
  expect(() => dayRange('2026-08-28', 24, TZ)).toThrow(/非法 cutoffHour/)
  expect(() => dayRange('2026-08-28', -1, TZ)).toThrow(/非法 cutoffHour/)
  expect(() => dayRange('2026-08-28', 4.5, TZ)).toThrow(/非法 cutoffHour/)
})

test('dayRange 正确跨月跨年', () => {
  expect(logicalDay(dayRange('2026-01-31', CUT, TZ).end, CUT, TZ)).toBe('2026-02-01')
  expect(logicalDay(dayRange('2026-12-31', CUT, TZ).end, CUT, TZ)).toBe('2027-01-01')
  expect(logicalDay(dayRange('2028-02-28', CUT, TZ).end, CUT, TZ)).toBe('2028-02-29')  // 闰年
})

// ★ 这是能捕获「绝对毫秒 vs 墙钟空间」那类 bug 的属性测试。
// 原测试只用 Asia/Shanghai（1991 年后无 DST），该 bug 必然全绿逃逸。
describe('logicalDay 与 dayRange 在夏令时时区上必须自洽', () => {
  const ZONES = ['America/New_York', 'Europe/Berlin', 'America/Santiago',
                 'Australia/Lord_Howe', 'Pacific/Auckland', 'America/Adak']
  const DAYS = ['2026-03-07', '2026-03-08', '2026-03-09',
                '2026-10-31', '2026-11-01', '2026-11-02',
                '2026-04-04', '2026-04-05', '2026-09-26', '2026-09-27']

  for (const tz of ZONES) {
    test(tz, () => {
      for (const dayId of DAYS) {
        const r = dayRange(dayId, CUT, tz)
        // 区间内均匀采样，含两端
        for (let i = 0; i <= 48; i++) {
          const at = r.start + Math.floor((r.end - 1 - r.start) * (i / 48))
          expect(logicalDay(at, CUT, tz)).toBe(dayId)
        }
        // 区间外一毫秒必须归属别的日子
        expect(logicalDay(r.start - 1, CUT, tz)).not.toBe(dayId)
        expect(logicalDay(r.end, CUT, tz)).not.toBe(dayId)
      }
    })
  }
})

test('相邻逻辑日的区间必须严丝合缝相接', () => {
  for (const tz of ['America/New_York', 'Asia/Shanghai', 'Australia/Lord_Howe']) {
    expect(dayRange('2026-03-07', CUT, tz).end).toBe(dayRange('2026-03-08', CUT, tz).start)
    expect(dayRange('2026-10-31', CUT, tz).end).toBe(dayRange('2026-11-01', CUT, tz).start)
  }
})
