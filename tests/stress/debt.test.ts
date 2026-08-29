import { expect, test } from 'bun:test'
import { computeDebt } from '../../src/stress/debt'
import { SIGNAL_WEIGHTS, type Signal } from '../../src/stress/signals'

const HALF_LIFE = 3

function sig(id: keyof typeof SIGNAL_WEIGHTS, fired: boolean, daysAgo: number): Signal {
  return { id, fired, value: 0, threshold: 0, daysAgo }
}

test('无信号触发时 debt 为 0', () => {
  expect(computeDebt([sig('late_night', false, 0)], HALF_LIFE)).toBe(0)
})

test('空输入 debt 为 0', () => {
  expect(computeDebt([], HALF_LIFE)).toBe(0)
})

test('全部信号今天触发时 debt 为 1', () => {
  const all = (Object.keys(SIGNAL_WEIGHTS) as Array<keyof typeof SIGNAL_WEIGHTS>)
    .map((id) => sig(id, true, 0))
  expect(computeDebt(all, HALF_LIFE)).toBeCloseTo(1, 6)
})

test('半衰期到点时权重减半', () => {
  const today = computeDebt([sig('late_night', true, 0)], HALF_LIFE)
  const older = computeDebt([sig('late_night', true, HALF_LIFE)], HALF_LIFE)
  expect(older).toBeCloseTo(today / 2, 6)
})

test('越久远的透支欠得越少，但不会突然归零', () => {
  const d0 = computeDebt([sig('late_night', true, 0)], HALF_LIFE)
  const d3 = computeDebt([sig('late_night', true, 3)], HALF_LIFE)
  const d9 = computeDebt([sig('late_night', true, 9)], HALF_LIFE)
  expect(d0).toBeGreaterThan(d3)
  expect(d3).toBeGreaterThan(d9)
  expect(d9).toBeGreaterThan(0)
})

test('debt 封顶为 1', () => {
  const many: Signal[] = []
  for (let d = 0; d < 10; d++) {
    for (const id of Object.keys(SIGNAL_WEIGHTS) as Array<keyof typeof SIGNAL_WEIGHTS>) {
      many.push(sig(id, true, d))
    }
  }
  expect(computeDebt(many, HALF_LIFE)).toBe(1)
})

test('权重生效：short_recovery 比 weekend_work 欠得多', () => {
  const a = computeDebt([sig('short_recovery', true, 0)], HALF_LIFE)
  const b = computeDebt([sig('weekend_work', true, 0)], HALF_LIFE)
  expect(a).toBeGreaterThan(b)
})
