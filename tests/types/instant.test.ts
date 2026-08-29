import { expect, test } from 'bun:test'
import { parseInstant, localDate, localHour, localToInstant } from '../../src/types/instant'

const TZ = 'Asia/Shanghai'

test('parseInstant 解析 ISO8601 UTC', () => {
  expect(parseInstant('2026-08-29T01:36:35.902Z')).toBe(Date.parse('2026-08-29T01:36:35.902Z'))
})

test('parseInstant 对非法输入返回 null', () => {
  expect(parseInstant('not-a-date')).toBeNull()
})

test('localDate 按时区换算，UTC 凌晨属于本地当天上午', () => {
  // 2026-08-29T01:36Z = 北京时间 09:36
  expect(localDate(parseInstant('2026-08-29T01:36:35.902Z')!, TZ)).toBe('2026-08-29')
})

test('localDate 跨日：UTC 深夜属于本地次日', () => {
  // 2026-08-28T17:00Z = 北京时间 08-29 01:00
  expect(localDate(parseInstant('2026-08-28T17:00:00Z')!, TZ)).toBe('2026-08-29')
})

test('localHour 返回本地小时', () => {
  expect(localHour(parseInstant('2026-08-28T17:00:00Z')!, TZ)).toBe(1)
  expect(localHour(parseInstant('2026-08-29T01:36:00Z')!, TZ)).toBe(9)
})

test('localToInstant 是 localDate/localHour 的逆运算', () => {
  const at = localToInstant(2026, 8, 29, 4, TZ)
  expect(localDate(at, TZ)).toBe('2026-08-29')
  expect(localHour(at, TZ)).toBe(4)
})

test('localToInstant 在夏令时跳变当天自洽（春季前跳）', () => {
  // 2026-03-08 是 America/New_York 春季跳变日；原测试用 03-15 在稳定 EDT 里，
  // 名为 DST 测试却根本没触及 DST
  const tz = 'America/New_York'
  const at = localToInstant(2026, 3, 8, 4, tz)
  expect(localDate(at, tz)).toBe('2026-03-08')
  expect(localHour(at, tz)).toBe(4)
})

test('localToInstant 在夏令时跳变当天自洽（秋季回拨）', () => {
  const tz = 'America/New_York'
  const at = localToInstant(2026, 11, 1, 4, tz)
  expect(localDate(at, tz)).toBe('2026-11-01')
  expect(localHour(at, tz)).toBe(4)
})

test('parseInstant 拒绝无偏移的时间串，而非按本机时区解释', () => {
  // Date.parse 的宽松回退会把这些按本机时区解释，Asia/Shanghai 下即 8 小时误差
  expect(parseInstant('2026-08-29')).toBeNull()
  expect(parseInstant('2026-08-29 10:00')).toBeNull()
  expect(parseInstant('2026')).toBeNull()
  expect(parseInstant('29 Aug 2026')).toBeNull()
})

test('parseInstant 拒绝首尾空格（宽松解析器会改变时区语义）', () => {
  expect(parseInstant(' 2026-08-29T01:00:00Z ')).toBeNull()
})

test('parseInstant 接受带偏移的形式', () => {
  expect(parseInstant('2026-08-29T01:00:00+08:00'))
    .toBe(Date.parse('2026-08-29T01:00:00+08:00'))
})
