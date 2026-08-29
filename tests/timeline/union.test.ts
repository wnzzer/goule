import { expect, test } from 'bun:test'
import { union, clipTo, totalMinutes, byHour } from '../../src/timeline/union'
import { parseInstant } from '../../src/types/instant'

const MIN = 60_000
const TZ = 'Asia/Shanghai'

test('空输入', () => {
  expect(union([])).toEqual([])
  expect(totalMinutes([])).toBe(0)
})

test('不相交的块保持不变', () => {
  const bs = [{ start: 0, end: 10 * MIN }, { start: 30 * MIN, end: 40 * MIN }]
  expect(union(bs)).toEqual(bs)
})

test('重叠的块合并', () => {
  const bs = [{ start: 0, end: 20 * MIN }, { start: 10 * MIN, end: 30 * MIN }]
  expect(union(bs)).toEqual([{ start: 0, end: 30 * MIN }])
})

test('被完全包含的块被吸收', () => {
  const bs = [{ start: 0, end: 60 * MIN }, { start: 10 * MIN, end: 20 * MIN }]
  expect(union(bs)).toEqual([{ start: 0, end: 60 * MIN }])
})

test('相邻但不重叠（end === start）合并', () => {
  const bs = [{ start: 0, end: 10 * MIN }, { start: 10 * MIN, end: 20 * MIN }]
  expect(union(bs)).toEqual([{ start: 0, end: 20 * MIN }])
})

test('并集消除并行双重计时', () => {
  // 两个工具同时活跃 0-60min，朴素求和是 120min，实际是 60min
  const bs = [{ start: 0, end: 60 * MIN }, { start: 0, end: 60 * MIN }]
  expect(totalMinutes(bs)).toBe(120)
  expect(totalMinutes(union(bs))).toBe(60)
})

test('乱序输入先排序', () => {
  const bs = [{ start: 30 * MIN, end: 40 * MIN }, { start: 0, end: 10 * MIN }]
  expect(union(bs)).toEqual([{ start: 0, end: 10 * MIN }, { start: 30 * MIN, end: 40 * MIN }])
})

test('不修改入参', () => {
  const bs = [{ start: 30 * MIN, end: 40 * MIN }, { start: 0, end: 10 * MIN }]
  union(bs)
  expect(bs[0]!.start).toBe(30 * MIN)
})

test('clipTo 裁剪跨边界的块', () => {
  const bs = [{ start: 0, end: 100 * MIN }]
  expect(clipTo(bs, { start: 20 * MIN, end: 50 * MIN }))
    .toEqual([{ start: 20 * MIN, end: 50 * MIN }])
})

test('clipTo 丢弃完全在区间外的块', () => {
  const bs = [{ start: 0, end: 10 * MIN }]
  expect(clipTo(bs, { start: 20 * MIN, end: 50 * MIN })).toEqual([])
})

test('byHour 把块分配到本地小时桶', () => {
  // 北京时间 2026-08-29 09:30 → 10:30，跨两个小时桶各 30 分钟
  const start = parseInstant('2026-08-29T01:30:00Z')!
  const buckets = byHour([{ start, end: start + 60 * MIN }], TZ)
  expect(buckets[9]).toBeCloseTo(30, 5)
  expect(buckets[10]).toBeCloseTo(30, 5)
  expect(buckets.reduce((a, b) => a + b, 0)).toBeCloseTo(60, 5)
})

test('byHour 桶长度恒为 24', () => {
  expect(byHour([], TZ)).toHaveLength(24)
})
