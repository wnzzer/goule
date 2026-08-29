import { expect, test } from 'bun:test'
import { evaluateSignals, type DayInput } from '../../src/stress/signals'
import { DEFAULT_CONFIG } from '../../src/types/config'
import type { Baseline } from '../../src/stress/baseline'

const CFG = DEFAULT_CONFIG.stress
const BASE: Baseline = { handsOnP90: 384, windowDays: 30, sufficient: true }

const quiet: DayInput = {
  dayId: '2026-08-29', handsOnMinutes: 200, lateNightMinutes: 0,
  crossesMidnight: false, recoveryHours: 12, consecutiveDays: 2,
  isWeekend: false, longestBlockMinutes: 60,
}

const fired = (input: DayInput, id: string): boolean =>
  evaluateSignals(input, BASE, CFG).find((s) => s.id === id)?.fired ?? false

test('作息正常的一天不触发任何信号', () => {
  expect(evaluateSignals(quiet, BASE, CFG).every((s) => !s.fired)).toBe(true)
})

test('late_night：深夜分钟超阈值触发', () => {
  expect(fired({ ...quiet, lateNightMinutes: 46 }, 'late_night')).toBe(true)
  expect(fired({ ...quiet, lateNightMinutes: 30 }, 'late_night')).toBe(false)
})

test('past_midnight：跨午夜即触发', () => {
  expect(fired({ ...quiet, crossesMidnight: true }, 'past_midnight')).toBe(true)
})

test('short_recovery：恢复窗不足触发', () => {
  expect(fired({ ...quiet, recoveryHours: 7.5 }, 'short_recovery')).toBe(true)
  expect(fired({ ...quiet, recoveryHours: 8 }, 'short_recovery')).toBe(false)
})

test('short_recovery：无前一日数据时不触发', () => {
  expect(fired({ ...quiet, recoveryHours: null }, 'short_recovery')).toBe(false)
})

test('consecutive_days：达到阈值触发', () => {
  expect(fired({ ...quiet, consecutiveDays: 6 }, 'consecutive_days')).toBe(true)
  expect(fired({ ...quiet, consecutiveDays: 5 }, 'consecutive_days')).toBe(false)
})

test('overlong_day：超个人 P90 触发', () => {
  expect(fired({ ...quiet, handsOnMinutes: 400 }, 'overlong_day')).toBe(true)
  expect(fired({ ...quiet, handsOnMinutes: 384 }, 'overlong_day')).toBe(false)
})

test('overlong_day：基线不足时永不触发', () => {
  const cold: Baseline = { handsOnP90: 10, windowDays: 30, sufficient: false }
  const s = evaluateSignals({ ...quiet, handsOnMinutes: 9999 }, cold, CFG)
  expect(s.find((x) => x.id === 'overlong_day')!.fired).toBe(false)
})

test('weekend_work：周末超阈值触发', () => {
  expect(fired({ ...quiet, isWeekend: true, handsOnMinutes: 90 }, 'weekend_work')).toBe(true)
  expect(fired({ ...quiet, isWeekend: true, handsOnMinutes: 60 }, 'weekend_work')).toBe(false)
  expect(fired({ ...quiet, isWeekend: false, handsOnMinutes: 500 }, 'weekend_work')).toBe(false)
})

test('no_break_block：单块过长触发', () => {
  expect(fired({ ...quiet, longestBlockMinutes: 150 }, 'no_break_block')).toBe(true)
})

test('返回全部 7 个信号，无论是否触发', () => {
  expect(evaluateSignals(quiet, BASE, CFG)).toHaveLength(7)
})
