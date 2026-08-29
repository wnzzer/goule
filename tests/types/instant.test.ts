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

test('localToInstant 在有夏令时的时区也自洽', () => {
  const tz = 'America/New_York'
  const at = localToInstant(2026, 3, 15, 4, tz)
  expect(localDate(at, tz)).toBe('2026-03-15')
  expect(localHour(at, tz)).toBe(4)
})
