import { expect, test } from 'bun:test'
import { aggregateMouseClicks, DailyMouseAccumulator } from '../../src/mouse/aggregate'
import { dayRange } from '../../src/types/day'
import { parseInstant } from '../../src/types/instant'

const TZ = 'Asia/Shanghai'
const RANGE = dayRange('2026-08-29', 4, TZ)
const t = (iso: string) => parseInstant(iso)!

test('只聚合逻辑日区间内的点击，并按本地小时分桶', () => {
  const activity = aggregateMouseClicks([
    { at: t('2026-08-28T19:59:59Z') }, // 北京 03:59:59，前一逻辑日
    { at: t('2026-08-28T20:00:00Z') }, // 北京 04:00，目标逻辑日
    { at: t('2026-08-29T01:15:00Z') }, // 北京 09:15
    { at: t('2026-08-29T20:00:00Z') }, // 北京次日 04:00，区间右端
  ], RANGE, TZ, 'macos-cgevent', 12)

  expect(activity.clicks).toBe(2)
  expect(activity.byHour[4]).toBe(1)
  expect(activity.byHour[9]).toBe(1)
  expect(activity.observedMinutes).toBe(12)
  expect(activity.provider).toBe('macos-cgevent')
})

test('DailyMouseAccumulator 跨逻辑日边界拆分观测时长', () => {
  const acc = new DailyMouseAccumulator(4, TZ, 'macos-cgevent')
  acc.addObserved(t('2026-08-28T19:30:00Z'), t('2026-08-28T20:30:00Z'))

  expect(acc.snapshot('2026-08-28')?.observedMinutes).toBeCloseTo(30, 5)
  expect(acc.snapshot('2026-08-29')?.observedMinutes).toBeCloseTo(30, 5)
})

test('DailyMouseAccumulator 不保存原始点击序列', () => {
  const acc = new DailyMouseAccumulator(4, TZ, 'macos-cgevent')
  acc.addClick({ at: t('2026-08-29T01:00:00Z') })
  const records = acc.recordsToWrite()
  expect(records).toHaveLength(1)
  expect(records[0]).not.toHaveProperty('events')
  expect(records[0]!.clicks).toBe(1)
})
