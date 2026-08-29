import { expect, test } from 'bun:test'
import { buildActivity } from '../../src/timeline/activity'
import { dayRange } from '../../src/types/day'
import { parseInstant } from '../../src/types/instant'
import type { RawSession } from '../../src/types/session'

const TZ = 'Asia/Shanghai'
const RANGE = dayRange('2026-08-29', 4, TZ)
const CFG = { idleGapMinutes: 10, minBlockCreditSeconds: 60, tz: TZ }
const t = (iso: string) => parseInstant(iso)!

function session(id: string, evts: Array<[string, 'human' | 'agent']>): RawSession {
  return {
    id, tool: 'claude-code', file: `/tmp/${id}.jsonl`,
    events: evts.map(([iso, kind]) => ({ at: t(iso), kind })),
    cwd: null, git: null, title: null, isSidechain: false, parentSessionId: null,
  }
}

test('hands_on 只算真人事件', () => {
  const s = session('a', [
    ['2026-08-29T01:00:00Z', 'human'],
    ['2026-08-29T01:05:00Z', 'agent'],
    ['2026-08-29T01:10:00Z', 'human'],
  ])
  const a = buildActivity([s], RANGE, CFG)
  expect(a.handsOn.minutes).toBeCloseTo(10, 5)
})

test('agent 时长是全量减 hands_on，两者不相加', () => {
  const s = session('a', [
    ['2026-08-29T01:00:00Z', 'human'],
    ['2026-08-29T01:10:00Z', 'agent'],
    ['2026-08-29T01:20:00Z', 'agent'],
  ])
  const a = buildActivity([s], RANGE, CFG)
  // 全量块 01:00→01:20 共 20min；hands_on 只有单点，得 1min 信用
  expect(a.handsOn.minutes).toBeCloseTo(1, 5)
  expect(a.agent.minutes).toBeCloseTo(19, 5)
})

test('agent 独跑一整夜不产生 hands_on —— 这是修正的核心', () => {
  const evts: Array<[string, 'human' | 'agent']> = []
  for (let i = 0; i < 60; i++) {
    const h = String(5 + Math.floor(i / 6)).padStart(2, '0')
    const m = String((i % 6) * 10).padStart(2, '0')
    evts.push([`2026-08-29T${h}:${m}:00Z`, 'agent'])
  }
  const a = buildActivity([session('bot', evts)], RANGE, CFG)
  expect(a.handsOn.minutes).toBe(0)
  expect(a.agent.minutes).toBeGreaterThan(500)
})

test('相隔超过 idle gap 的锚点被切成两块，各得最小信用', () => {
  // 01:00 与 01:30 相隔 30 分钟 > idleGap 10 分钟：这不是连续工作
  const s = session('a', [['2026-08-29T01:00:00Z', 'human'], ['2026-08-29T01:30:00Z', 'human']])
  const a = buildActivity([s], RANGE, CFG)
  expect(a.handsOn.blocks).toHaveLength(2)
  expect(a.handsOn.minutes).toBeCloseTo(2, 5)   // 两个单点块 × 1 分钟信用
})

test('并行 session 的 hands_on 做并集，不双重计时', () => {
  // 锚点每 5 分钟一个（密于 idleGap），01:00→01:30 连成一块
  const dense: Array<[string, 'human']> = [
    ['2026-08-29T01:00:00Z', 'human'], ['2026-08-29T01:05:00Z', 'human'],
    ['2026-08-29T01:10:00Z', 'human'], ['2026-08-29T01:15:00Z', 'human'],
    ['2026-08-29T01:20:00Z', 'human'], ['2026-08-29T01:25:00Z', 'human'],
    ['2026-08-29T01:30:00Z', 'human'],
  ]
  const s1 = session('a', dense)
  const s2 = session('b', dense)
  expect(buildActivity([s1], RANGE, CFG).handsOn.minutes).toBeCloseTo(30, 5)
  // 两个 session 完全重叠：朴素求和是 60，并集后仍是 30
  expect(buildActivity([s1, s2], RANGE, CFG).handsOn.minutes).toBeCloseTo(30, 5)
})

test('区间外的事件被裁剪掉', () => {
  const s = session('a', [
    ['2026-08-28T18:00:00Z', 'human'],  // 北京 08-29 02:00，属 08-28 逻辑日
    ['2026-08-29T02:00:00Z', 'human'],  // 北京 08-29 10:00，属 08-29 逻辑日
    ['2026-08-29T02:10:00Z', 'human'],
  ])
  const a = buildActivity([s], RANGE, CFG)
  expect(a.handsOn.minutes).toBeCloseTo(10, 5)
})

test('byHour 桶长度为 24 且总和等于 minutes', () => {
  const s = session('a', [['2026-08-29T01:00:00Z', 'human'], ['2026-08-29T01:30:00Z', 'human']])
  const a = buildActivity([s], RANGE, CFG)
  expect(a.handsOn.byHour).toHaveLength(24)
  expect(a.handsOn.byHour.reduce((x, y) => x + y, 0)).toBeCloseTo(a.handsOn.minutes, 5)
})

test('无 session 时全为 0', () => {
  const a = buildActivity([], RANGE, CFG)
  expect(a.handsOn.minutes).toBe(0)
  expect(a.agent.minutes).toBe(0)
  expect(a.handsOn.blocks).toEqual([])
})
