import { expect, test } from 'bun:test'
import { computeBaseline, percentile } from '../../src/stress/baseline'

test('percentile 用线性插值（与 numpy 默认口径一致）', () => {
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  // idx = (10-1) * 0.9 = 8.1 → 在 sorted[8]=90 与 sorted[9]=100 之间插值
  expect(percentile(v, 0.9)).toBeCloseTo(91, 6)
  // idx = 9 * 0.5 = 4.5 → 50 与 60 的中点
  expect(percentile(v, 0.5)).toBeCloseTo(55, 6)
})

test('percentile 对已是分界点的位置不插值', () => {
  expect(percentile([10, 20, 30], 0.5)).toBe(20)
  expect(percentile([10, 20, 30], 1)).toBe(30)
  expect(percentile([10, 20, 30], 0)).toBe(10)
})

test('percentile 对单元素返回该元素', () => {
  expect(percentile([42], 0.9)).toBe(42)
})

test('percentile 对空数组返回 0', () => {
  expect(percentile([], 0.9)).toBe(0)
})

test('样本足够时 sufficient 为 true', () => {
  const daily = Array.from({ length: 20 }, (_, i) => (i + 1) * 20)
  const b = computeBaseline(daily, 30, 14)
  expect(b.sufficient).toBe(true)
  expect(b.handsOnP90).toBeGreaterThan(0)
})

test('样本不足时 sufficient 为 false —— 新用户不被无意义基线误判', () => {
  const b = computeBaseline([100, 200, 300], 30, 14)
  expect(b.sufficient).toBe(false)
})

test('只取窗口内最近 N 天', () => {
  const daily = Array.from({ length: 60 }, () => 100)
  const b = computeBaseline(daily, 30, 14)
  expect(b.windowDays).toBe(30)
})

test('零活动的天不计入样本：5 天里只有 2 天有活动，minDays=3 时不足', () => {
  const b = computeBaseline([0, 0, 0, 100, 200], 30, 3)
  expect(b.sufficient).toBe(false)
  expect(b.handsOnP90).toBeGreaterThan(0)
})
