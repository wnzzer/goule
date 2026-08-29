import { expect, test } from 'bun:test'
import { deriveDayInput, consecutiveDaysEndingAt } from '../src/scan'
import { dayRange } from '../src/types/day'
import { parseInstant } from '../src/types/instant'
import type { Block } from '../src/timeline/blocks'

const TZ = 'Asia/Shanghai'
const t = (iso: string) => parseInstant(iso)!

test('consecutiveDaysEndingAt 统计连续有活动的天数', () => {
  const active = new Set(['2026-08-26', '2026-08-27', '2026-08-28'])
  expect(consecutiveDaysEndingAt('2026-08-28', active)).toBe(3)
})

test('consecutiveDaysEndingAt 遇到空白日中断', () => {
  const active = new Set(['2026-08-24', '2026-08-27', '2026-08-28'])
  expect(consecutiveDaysEndingAt('2026-08-28', active)).toBe(2)
})

test('当日无活动则为 0', () => {
  expect(consecutiveDaysEndingAt('2026-08-29', new Set(['2026-08-28']))).toBe(0)
})

test('deriveDayInput 算出深夜分钟并识别跨午夜', () => {
  // 北京 2026-08-28 23:30 → 08-29 00:30：真正跨午夜，且整段落在深夜窗 [23,6)
  const blocks: Block[] = [{ start: t('2026-08-28T15:30:00Z'), end: t('2026-08-28T16:30:00Z') }]
  const d = deriveDayInput({
    dayId: '2026-08-28', range: dayRange('2026-08-28', 4, TZ), tz: TZ,
    handsOnBlocks: blocks, handsOnMinutes: 60,
    prevDayLastAnchor: null, activeDays: new Set(['2026-08-28']),
    lateNightWindow: [23, 6],
  })
  expect(d.lateNightMinutes).toBeCloseTo(60, 5)
  expect(d.crossesMidnight).toBe(true)
})

test('deriveDayInput 白天工作不算深夜、不跨午夜', () => {
  const blocks: Block[] = [{ start: t('2026-08-29T02:00:00Z'), end: t('2026-08-29T03:00:00Z') }]
  const d = deriveDayInput({
    dayId: '2026-08-29', range: dayRange('2026-08-29', 4, TZ), tz: TZ,
    handsOnBlocks: blocks, handsOnMinutes: 60,
    prevDayLastAnchor: null, activeDays: new Set(['2026-08-29']),
    lateNightWindow: [23, 6],
  })
  expect(d.lateNightMinutes).toBe(0)
  expect(d.crossesMidnight).toBe(false)
})

test('deriveDayInput 算出恢复窗', () => {
  const blocks: Block[] = [{ start: t('2026-08-29T02:00:00Z'), end: t('2026-08-29T03:00:00Z') }]
  const d = deriveDayInput({
    dayId: '2026-08-29', range: dayRange('2026-08-29', 4, TZ), tz: TZ,
    handsOnBlocks: blocks, handsOnMinutes: 60,
    prevDayLastAnchor: t('2026-08-28T14:00:00Z'),  // 12 小时前
    activeDays: new Set(['2026-08-28', '2026-08-29']),
    lateNightWindow: [23, 6],
  })
  expect(d.recoveryHours).toBeCloseTo(12, 3)
})

test('deriveDayInput 取最长块', () => {
  const blocks: Block[] = [
    { start: t('2026-08-29T02:00:00Z'), end: t('2026-08-29T02:10:00Z') },
    { start: t('2026-08-29T03:00:00Z'), end: t('2026-08-29T05:30:00Z') },
  ]
  const d = deriveDayInput({
    dayId: '2026-08-29', range: dayRange('2026-08-29', 4, TZ), tz: TZ,
    handsOnBlocks: blocks, handsOnMinutes: 160,
    prevDayLastAnchor: null, activeDays: new Set(['2026-08-29']),
    lateNightWindow: [23, 6],
  })
  expect(d.longestBlockMinutes).toBeCloseTo(150, 5)
})
