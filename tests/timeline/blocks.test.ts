import { expect, test } from 'bun:test'
import { toBlocks } from '../../src/timeline/blocks'

const MIN = 60_000
const GAP = 10 * MIN
const CREDIT = 1 * MIN

test('空输入返回空数组', () => {
  expect(toBlocks([], GAP, CREDIT)).toEqual([])
})

test('单个事件得到一个最小信用块', () => {
  const t = 1_000_000
  expect(toBlocks([t], GAP, CREDIT)).toEqual([{ start: t, end: t + CREDIT }])
})

test('间隔小于阈值的事件合成一块', () => {
  const t = 1_000_000
  const blocks = toBlocks([t, t + 5 * MIN, t + 9 * MIN], GAP, CREDIT)
  expect(blocks).toEqual([{ start: t, end: t + 9 * MIN }])
})

test('间隔超过阈值则断开', () => {
  const t = 1_000_000
  const blocks = toBlocks([t, t + 5 * MIN, t + 30 * MIN, t + 33 * MIN], GAP, CREDIT)
  expect(blocks).toEqual([
    { start: t, end: t + 5 * MIN },
    { start: t + 30 * MIN, end: t + 33 * MIN },
  ])
})

test('恰好等于阈值不断开（用 > 而非 >=）', () => {
  const t = 1_000_000
  expect(toBlocks([t, t + GAP], GAP, CREDIT)).toEqual([{ start: t, end: t + GAP }])
})

test('乱序输入先排序', () => {
  const t = 1_000_000
  const blocks = toBlocks([t + 5 * MIN, t, t + 9 * MIN], GAP, CREDIT)
  expect(blocks).toEqual([{ start: t, end: t + 9 * MIN }])
})

test('重复时间戳不产生零长块', () => {
  const t = 1_000_000
  expect(toBlocks([t, t, t], GAP, CREDIT)).toEqual([{ start: t, end: t + CREDIT }])
})

test('不修改入参数组', () => {
  const input = [3, 1, 2]
  toBlocks(input, GAP, CREDIT)
  expect(input).toEqual([3, 1, 2])
})
