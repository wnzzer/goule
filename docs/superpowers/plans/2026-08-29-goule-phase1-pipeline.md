# Goule Phase 1 数据管道 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从本机 Claude Code 与 Codex 的 session 文件计算出某个逻辑日的 `hands_on` / `agent` 工时与压力信号，通过 `goule scan` 输出 JSON。

**Architecture:** 单向纯函数管道。`adapters` 只做流式解析产出 `RawSession`；`timeline` 把事件切成活跃块、做区间并集、按逻辑日裁剪、拆分 hands_on 与 agent；`stress` 在 hands_on 之上算信号与压力债。全部不触网、不碰时钟（时间由参数注入），因此可完整单测。

**Tech Stack:** Bun 1.3+ / TypeScript strict / `bun test` / 零运行时依赖。

**Scope:** 本计划实现设计文档 `docs/superpowers/specs/2026-08-29-goule-phase1-design.md` 的 M0–M2b。Git 扫描、join、日报渲染与润色层（M3–M5）由后续计划覆盖。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| `src/types/instant.ts` | `Instant`（UTC epoch ms）与时区换算。唯一允许做 UTC↔本地转换的地方 |
| `src/types/day.ts` | 逻辑日边界：`logicalDay()` / `dayRange()` |
| `src/types/session.ts` | `RawSession` / `SessionEvent` / `ToolId` |
| `src/types/config.ts` | 配置类型与默认值 |
| `src/timeline/blocks.ts` | 事件序列 → 活跃块（idle gap 切分 + 最小信用） |
| `src/timeline/union.ts` | 区间并集、裁剪、求和、按小时分桶 |
| `src/timeline/activity.ts` | hands_on / agent 拆分，产出 `Activity` |
| `src/adapters/types.ts` | `SessionAdapter` 接口 |
| `src/adapters/jsonl.ts` | 流式逐行读取 + 时间戳正则提取（两级解析策略） |
| `src/adapters/claude-code.ts` | CC adapter，含 subagent 递归发现与真人谓词 |
| `src/adapters/codex.ts` | Codex adapter，含 `session_meta` 解析 |
| `src/stress/baseline.ts` | 个人 hands_on P90 基线与冷启动判定 |
| `src/stress/signals.ts` | 7 个压力信号的求值 |
| `src/stress/debt.ts` | 半衰压力债 |
| `src/scan.ts` | 编排：discover → parse → timeline → stress |
| `src/index.ts` | CLI（已存在，本计划接上 `scan` 与 `doctor`） |
| `scripts/make-fixture.ts` | 从真实 session 文件生成脱敏 fixture |
| `tests/fixtures/` | 脱敏样本（可安全提交） |

---

## Task 1: 测试基线与 CI

**Files:**
- Modify: `package.json`
- Create: `tests/smoke.test.ts`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 写一个必然通过的冒烟测试**

创建 `tests/smoke.test.ts`：

```ts
import { expect, test } from 'bun:test'

test('bun test 可运行', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 2: 运行，确认测试基线可用**

Run: `bun test`
Expected: `1 pass  0 fail`

- [ ] **Step 3: 加 test 脚本**

修改 `package.json` 的 `scripts`，在 `typecheck` 后加一行：

```json
    "typecheck": "bunx tsc --noEmit",
    "test": "bun test"
```

- [ ] **Step 4: 加 CI**

创建 `.github/workflows/ci.yml`：

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun test
```

- [ ] **Step 5: 验证并提交**

Run: `bun run typecheck && bun test`
Expected: typecheck 无输出（成功），测试 `1 pass`

```bash
git add package.json tests/smoke.test.ts .github/workflows/ci.yml
git commit -m "chore: 建立 bun test 基线与 CI"
```

---

## Task 2: Instant 与时区换算

设计文档 §4.2 把时区列为最易埋雷处，要求内部一律存 UTC，只在切日与展示时转本地。本任务是唯一允许做该转换的模块。

**Files:**
- Create: `src/types/instant.ts`
- Create: `tests/types/instant.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/types/instant.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/types/instant.test.ts`
Expected: FAIL，报 `Cannot find module '../../src/types/instant'`

- [ ] **Step 3: 实现**

创建 `src/types/instant.ts`：

```ts
/** UTC 瞬时，epoch 毫秒。内部一律用它；禁止在本模块之外做本地时间换算。 */
export type Instant = number

/** IANA 时区名，如 'Asia/Shanghai' */
export type Tz = string

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000

export function parseInstant(iso: string): Instant | null {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

const fmtCache = new Map<Tz, Intl.DateTimeFormat>()

function formatter(tz: Tz): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
    fmtCache.set(tz, f)
  }
  return f
}

export interface LocalParts {
  year: number; month: number; day: number
  hour: number; minute: number; second: number
}

export function localParts(at: Instant, tz: Tz): LocalParts {
  const parts = formatter(tz).formatToParts(at)
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type)
    if (!p) throw new Error(`时区格式化缺少字段: ${type}`)
    return Number(p.value)
  }
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function localDate(at: Instant, tz: Tz): string {
  const p = localParts(at, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function localHour(at: Instant, tz: Tz): number {
  return localParts(at, tz).hour
}

/**
 * 本地墙钟时间 → Instant。
 * 先按 UTC 猜，再用该时刻的实际偏移修正；两次迭代足以收敛（含 DST 切换）。
 */
export function localToInstant(
  year: number, month: number, day: number, hour: number, tz: Tz,
): Instant {
  const target = Date.UTC(year, month - 1, day, hour, 0, 0)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, tz)
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    guess += target - asIfUtc
  }
  return guess
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/types/instant.test.ts`
Expected: `7 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/types/instant.ts tests/types/instant.test.ts
git commit -m "feat: Instant 类型与时区换算"
```

---

## Task 3: 逻辑日边界

设计文档 §4.1：`day_id "2026-08-28"` ≡ `[08-28 04:00, 08-29 04:00)` 本地时区。实测存在 17:52 → 次日 01:20 的 448 分钟连续块，按自然日切会腰斩。

**Files:**
- Create: `src/types/day.ts`
- Create: `tests/types/day.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/types/day.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { logicalDay, dayRange, isWeekend } from '../../src/types/day'
import { parseInstant, localDate, localHour } from '../../src/types/instant'

const TZ = 'Asia/Shanghai'
const CUT = 4

test('凌晨 01:20 归属前一个逻辑日', () => {
  // 北京时间 2026-08-29 01:20 → UTC 2026-08-28T17:20Z
  const at = parseInstant('2026-08-28T17:20:00Z')!
  expect(localDate(at, TZ)).toBe('2026-08-29')      // 自然日是 29
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-28') // 逻辑日是 28
})

test('上午 09:36 归属当天逻辑日', () => {
  const at = parseInstant('2026-08-29T01:36:00Z')!
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-29')
})

test('恰好 04:00 归属当天', () => {
  // 北京时间 2026-08-29 04:00 → UTC 2026-08-28T20:00Z
  const at = parseInstant('2026-08-28T20:00:00Z')!
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-29')
})

test('03:59 仍归属前一天', () => {
  const at = parseInstant('2026-08-28T19:59:00Z')!
  expect(logicalDay(at, CUT, TZ)).toBe('2026-08-28')
})

test('cutoff=0 时退化为自然日', () => {
  const at = parseInstant('2026-08-28T17:20:00Z')!
  expect(logicalDay(at, 0, TZ)).toBe('2026-08-29')
})

test('dayRange 的起止是本地 04:00，跨度 24 小时', () => {
  const r = dayRange('2026-08-28', CUT, TZ)
  expect(localDate(r.start, TZ)).toBe('2026-08-28')
  expect(localHour(r.start, TZ)).toBe(4)
  expect(localDate(r.end, TZ)).toBe('2026-08-29')
  expect(localHour(r.end, TZ)).toBe(4)
  expect(r.end - r.start).toBe(24 * 3_600_000)
})

test('dayRange 与 logicalDay 自洽：区间内任意点的逻辑日等于 dayId', () => {
  const r = dayRange('2026-08-28', CUT, TZ)
  expect(logicalDay(r.start, CUT, TZ)).toBe('2026-08-28')
  expect(logicalDay(r.end - 1, CUT, TZ)).toBe('2026-08-28')
  expect(logicalDay(r.end, CUT, TZ)).toBe('2026-08-29')
})

test('isWeekend 识别周六周日', () => {
  expect(isWeekend('2026-08-29')).toBe(true)   // 周六
  expect(isWeekend('2026-08-30')).toBe(true)   // 周日
  expect(isWeekend('2026-08-28')).toBe(false)  // 周五
  expect(isWeekend('2026-08-31')).toBe(false)  // 周一
})

test('dayRange 拒绝非法 dayId', () => {
  expect(() => dayRange('2026-8-1', CUT, TZ)).toThrow()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/types/day.test.ts`
Expected: FAIL，报找不到模块 `../../src/types/day`

- [ ] **Step 3: 实现**

创建 `src/types/day.ts`：

```ts
import { HOUR_MS, localDate, localToInstant, type Instant, type Tz } from './instant'

export interface DayRange {
  dayId: string
  start: Instant
  end: Instant
  cutoffHour: number
  tz: Tz
}

/** 某瞬时属于哪个逻辑日。逻辑日从本地 cutoffHour 开始。 */
export function logicalDay(at: Instant, cutoffHour: number, tz: Tz): string {
  return localDate(at - cutoffHour * HOUR_MS, tz)
}

/** dayId（YYYY-MM-DD）→ 该逻辑日的 [start, end) 区间 */
export function dayRange(dayId: string, cutoffHour: number, tz: Tz): DayRange {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId)
  if (!m) throw new Error(`非法 dayId: ${dayId}（应为 YYYY-MM-DD）`)
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3])

  const start = localToInstant(year, month, day, cutoffHour, tz)
  // 次日：用 UTC 算历法上的下一天，再解析回本地 cutoff
  const nextUtc = new Date(Date.UTC(year, month - 1, day + 1))
  const end = localToInstant(
    nextUtc.getUTCFullYear(), nextUtc.getUTCMonth() + 1, nextUtc.getUTCDate(),
    cutoffHour, tz,
  )
  return { dayId, start, end, cutoffHour, tz }
}

/** 该逻辑日是否为周末。dayId 已是本地日期，无需时区参数。 */
export function isWeekend(dayId: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId)
  if (!m) throw new Error(`非法 dayId: ${dayId}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/types/day.test.ts`
Expected: `9 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/types/day.ts tests/types/day.test.ts
git commit -m "feat: 逻辑日边界（默认 04:00 cutoff）"
```

---

## Task 4: 活跃块切分

设计文档 §4.3 步骤 3–4：相邻锚点间隔 > `idle_gap_minutes`(10) 断开；零时长块给 `min_block_credit`(60s)。

**Files:**
- Create: `src/timeline/blocks.ts`
- Create: `tests/timeline/blocks.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/timeline/blocks.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/timeline/blocks.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/timeline/blocks.ts`：

```ts
import type { Instant } from '../types/instant'

export interface Block {
  start: Instant
  end: Instant
}

/**
 * 事件时间序列 → 活跃块。
 * 相邻间隔 > idleGapMs 断开；零时长块给 minCreditMs 的固定信用
 * （代表一次真实交互，计 0 不诚实；但也不应让它冒充工作块）。
 */
export function toBlocks(times: Instant[], idleGapMs: number, minCreditMs: number): Block[] {
  if (times.length === 0) return []
  const sorted = [...times].sort((a, b) => a - b)

  const out: Block[] = []
  let start = sorted[0]!
  let end = sorted[0]!
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    if (cur - end > idleGapMs) {
      out.push({ start, end })
      start = cur
    }
    end = cur
  }
  out.push({ start, end })

  return out.map((b) => (b.end === b.start ? { start: b.start, end: b.start + minCreditMs } : b))
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/timeline/blocks.test.ts`
Expected: `8 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/timeline/blocks.ts tests/timeline/blocks.test.ts
git commit -m "feat: 活跃块切分"
```

---

## Task 5: 区间并集、裁剪与分桶

设计文档 §4.3 步骤 5–7。并集是**正确性要求**：并行开多个窗口或 subagent 与父 session 重叠时，分别求和再相加会虚高（实测 5%）。

**Files:**
- Create: `src/timeline/union.ts`
- Create: `tests/timeline/union.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/timeline/union.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/timeline/union.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/timeline/union.ts`：

```ts
import { MINUTE_MS, localParts, type Instant, type Tz } from '../types/instant'
import type { Block } from './blocks'

/** 区间并集。消除并行 session / subagent 重叠造成的双重计时。 */
export function union(blocks: Block[]): Block[] {
  if (blocks.length === 0) return []
  const sorted = [...blocks].sort((a, b) => a.start - b.start)

  const out: Block[] = [{ ...sorted[0]! }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = out[out.length - 1]!
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push({ ...cur })
  }
  return out
}

/** 按区间裁剪，丢弃裁剪后为空的块 */
export function clipTo(blocks: Block[], range: { start: Instant; end: Instant }): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const start = Math.max(b.start, range.start)
    const end = Math.min(b.end, range.end)
    if (end > start) out.push({ start, end })
  }
  return out
}

export function totalMinutes(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + (b.end - b.start), 0) / MINUTE_MS
}

/** 把块时长分配到 24 个本地小时桶（分钟） */
export function byHour(blocks: Block[], tz: Tz): number[] {
  const buckets = new Array<number>(24).fill(0)
  for (const b of blocks) {
    let cur = b.start
    while (cur < b.end) {
      const p = localParts(cur, tz)
      const msToNextHour = ((59 - p.minute) * 60 + (60 - p.second)) * 1000
      const next = Math.min(b.end, cur + msToNextHour)
      const step = next - cur
      if (step <= 0) { cur += MINUTE_MS; continue }   // 防御性：绝不空转
      buckets[p.hour] = (buckets[p.hour] ?? 0) + step / MINUTE_MS
      cur = next
    }
  }
  return buckets
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/timeline/union.test.ts`
Expected: `12 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/timeline/union.ts tests/timeline/union.test.ts
git commit -m "feat: 区间并集、裁剪与小时分桶"
```

---

## Task 6: 会话类型与 adapter 接口

设计文档 §6.1：**接口取字段并集而非交集**。取最小公共子集会砍掉 `aiTitle`（CC 独有）与 `commitHash`（Codex 独有），每接一个新工具信息就少一分。

**Files:**
- Create: `src/types/session.ts`
- Create: `src/adapters/types.ts`
- Create: `tests/types/session.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/types/session.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { humanTimes, agentTimes, type RawSession } from '../../src/types/session'

const base: RawSession = {
  id: 's1', tool: 'claude-code', file: '/tmp/s1.jsonl',
  events: [
    { at: 100, kind: 'human' },
    { at: 200, kind: 'agent' },
    { at: 300, kind: 'human' },
  ],
  cwd: '/repo', git: null, title: null,
  isSidechain: false, parentSessionId: null,
}

test('humanTimes 只取真人事件', () => {
  expect(humanTimes(base)).toEqual([100, 300])
})

test('agentTimes 取全部事件（agent 时长是全量口径的上界）', () => {
  expect(agentTimes(base)).toEqual([100, 200, 300])
})

test('无事件时返回空数组', () => {
  expect(humanTimes({ ...base, events: [] })).toEqual([])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/types/session.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/types/session.ts`：

```ts
import type { Instant } from './instant'

export type ToolId = 'claude-code' | 'codex'

/**
 * human = 真人输入锚点，是唯一的工时依据。
 * agent = 模型/工具产生的记录。
 * 实测真人输入仅占全部记录的 8.89%，混算会让工时虚高 63%（单日最坏 7.3 倍）。
 */
export type EventKind = 'human' | 'agent'

export interface SessionEvent {
  at: Instant
  kind: EventKind
}

export interface SessionGit {
  branch: string | null
  commitHash: string | null
  remoteUrl: string | null
}

export interface RawSession {
  id: string
  tool: ToolId
  file: string
  events: SessionEvent[]
  cwd: string | null
  /** Codex 全有；CC 只有 branch */
  git: SessionGit | null
  /** CC 的 aiTitle；Codex 恒为 null，交给润色层补 */
  title: string | null
  isSidechain: boolean
  parentSessionId: string | null
}

export function humanTimes(s: RawSession): Instant[] {
  return s.events.filter((e) => e.kind === 'human').map((e) => e.at)
}

/** 全部事件时间。agent 块以此为锚点，再减去 hands_on 部分。 */
export function agentTimes(s: RawSession): Instant[] {
  return s.events.map((e) => e.at)
}
```

创建 `src/adapters/types.ts`：

```ts
import type { DayRange } from '../types/day'
import type { RawSession, ToolId } from '../types/session'

export interface Candidate {
  file: string
  mtimeMs: number
}

export interface SessionAdapter {
  readonly tool: ToolId
  /** mtime / 路径预过滤，只缩小候选集；最终归属以记录内 timestamp 为准 */
  discover(root: string, range: DayRange): Promise<Candidate[]>
  parse(c: Candidate): Promise<RawSession | null>
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/types/session.test.ts`
Expected: `3 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/types/session.ts src/adapters/types.ts tests/types/session.test.ts
git commit -m "feat: RawSession 类型与 SessionAdapter 接口"
```

---

## Task 7: JSONL 流式扫描

设计文档 §6.4：朴素 `JSON.parse` 283 MB 需 1073 ms，两级策略降至 124 ms。单个文件实测可达 **466 MB**，必须流式读取，绝不可整体载入内存。

**Files:**
- Create: `src/adapters/jsonl.ts`
- Create: `tests/adapters/jsonl.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/adapters/jsonl.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLines, firstTimestamp } from '../../src/adapters/jsonl'

function tmpFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'goule-'))
  const p = join(dir, 'a.jsonl')
  writeFileSync(p, content)
  return p
}

test('readLines 逐行产出，跳过空行', async () => {
  const p = tmpFile('{"a":1}\n\n{"b":2}\n')
  const out: string[] = []
  for await (const line of readLines(p)) out.push(line)
  expect(out).toEqual(['{"a":1}', '{"b":2}'])
})

test('readLines 处理无尾换行的最后一行', async () => {
  const p = tmpFile('{"a":1}\n{"b":2}')
  const out: string[] = []
  for await (const line of readLines(p)) out.push(line)
  expect(out).toEqual(['{"a":1}', '{"b":2}'])
})

test('readLines 处理跨 chunk 的长行', async () => {
  const big = 'x'.repeat(300_000)
  const p = tmpFile(`{"v":"${big}"}\n{"b":2}\n`)
  const out: string[] = []
  for await (const line of readLines(p)) out.push(line)
  expect(out).toHaveLength(2)
  expect(out[0]!.length).toBe(300_000 + 8)
})

test('firstTimestamp 取每行第一个匹配（实测 100% 准确）', () => {
  const line = '{"timestamp":"2026-08-29T01:36:35.902Z","ordinal":0}'
  expect(firstTimestamp(line)).toBe(Date.parse('2026-08-29T01:36:35.902Z'))
})

test('firstTimestamp 在正文含时间戳时仍取顶层的那个', () => {
  const line = '{"timestamp":"2026-08-29T01:00:00.000Z","message":{"content":"看这段 \\"timestamp\\":\\"2020-01-01T00:00:00.000Z\\""}}'
  expect(firstTimestamp(line)).toBe(Date.parse('2026-08-29T01:00:00.000Z'))
})

test('firstTimestamp 无匹配返回 null', () => {
  expect(firstTimestamp('{"type":"ai-title","aiTitle":"x"}')).toBeNull()
})

test('firstTimestamp 容忍键后空格', () => {
  expect(firstTimestamp('{"timestamp": "2026-08-29T01:00:00.000Z"}'))
    .toBe(Date.parse('2026-08-29T01:00:00.000Z'))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/adapters/jsonl.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/adapters/jsonl.ts`：

```ts
import { parseInstant, type Instant } from '../types/instant'

/**
 * 流式逐行读取。单个 session 文件实测可达 466 MB，
 * 绝不可用 Bun.file().text() 整体载入。
 */
export async function* readLines(path: string): AsyncGenerator<string> {
  const stream = Bun.file(path).stream()
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of stream) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true })
    let idx = buf.indexOf('\n')
    while (idx >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (line.trim().length > 0) yield line
      idx = buf.indexOf('\n')
    }
  }
  buf += decoder.decode()
  if (buf.trim().length > 0) yield buf
}

const TS_RE = /"timestamp":\s*"(\d{4}-\d{2}-\d{2}T[^"]{4,32})"/

/**
 * 取每行第一个 timestamp 匹配。
 * 实测：取第一个 100.00% 准确（37726/37726），取最后一个 99.97%。
 * 不做 JSON.parse —— 这是 8.7 倍性能差距的来源。
 */
export function firstTimestamp(line: string): Instant | null {
  const m = TS_RE.exec(line)
  return m?.[1] ? parseInstant(m[1]) : null
}

/**
 * 假阳性防护：正文里出现的示例时间戳可能被误匹配。
 * 提取值须落在 [文件 mtime - 30d, now + 1d] 内。
 */
export function plausible(at: Instant, mtimeMs: number): boolean {
  const lower = mtimeMs - 30 * 86_400_000
  const upper = Date.now() + 86_400_000
  return at >= lower && at <= upper
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/adapters/jsonl.test.ts`
Expected: `7 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/adapters/jsonl.ts tests/adapters/jsonl.test.ts
git commit -m "feat: JSONL 流式扫描与时间戳提取"
```

---

## Task 8: 脱敏 fixture 生成脚本

设计文档 §10：真实 session 文件含公司代码与对话正文，绝不能进 repo。**该脚本本身是隐私边界的第一道验证**——剥除全部 content 后测试仍全绿，即证明 L1–L4 只依赖元数据。

**Files:**
- Create: `scripts/make-fixture.ts`
- Create: `tests/fixtures/README.md`

- [ ] **Step 1: 写脚本**

创建 `scripts/make-fixture.ts`：

```ts
#!/usr/bin/env bun
/**
 * 从真实 session 文件生成脱敏 fixture。
 * 保留：type / timestamp / 结构骨架 / 角色标记 / 路径形状
 * 剥除：message.content、tool 参数与结果、base_instructions、思维链
 *
 * 用法: bun run scripts/make-fixture.ts <真实文件> <输出路径> [最多行数]
 */
import { readLines } from '../src/adapters/jsonl'

const SENSITIVE_KEYS = new Set([
  'content', 'text', 'input', 'output', 'arguments', 'result',
  'base_instructions', 'reasoning', 'summary', 'thinking',
  'repository_url', 'remoteUrl',
])

function scrub(node: unknown, depth = 0): unknown {
  if (depth > 12) return null
  if (Array.isArray(node)) return node.map((x) => scrub(x, depth + 1))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = typeof v === 'string' ? `<scrubbed:${v.length}>` : '<scrubbed>'
      } else if (k === 'cwd' || k === 'file' || k === 'path') {
        out[k] = typeof v === 'string' ? v.replace(/\/Users\/[^/]+/, '/Users/tester') : v
      } else {
        out[k] = scrub(v, depth + 1)
      }
    }
    return out
  }
  return node
}

const [src, dst, maxRaw] = Bun.argv.slice(2)
if (!src || !dst) {
  console.error('用法: bun run scripts/make-fixture.ts <真实文件> <输出路径> [最多行数]')
  process.exit(1)
}
const max = maxRaw ? Number(maxRaw) : 500

const out: string[] = []
for await (const line of readLines(src)) {
  if (out.length >= max) break
  try {
    out.push(JSON.stringify(scrub(JSON.parse(line))))
  } catch {
    // 非 JSON 行直接丢弃，fixture 不需要它
  }
}
await Bun.write(dst, out.join('\n') + '\n')
console.log(`已写入 ${dst}（${out.length} 行，源 ${src}）`)
```

- [ ] **Step 2: 加 fixture 目录说明**

创建 `tests/fixtures/README.md`：

```markdown
# 测试 fixture

本目录下的 `.jsonl` 均由 `scripts/make-fixture.ts` 从真实 session 文件生成，
已剥除全部 `content` / 工具参数与结果 / 思维链，并把 `/Users/<name>` 替换为
`/Users/tester`。

**不得手工放入未经该脚本处理的真实 session 文件。**

若剥除正文后 L1–L4 的测试仍全部通过，即证明这几层确实只依赖元数据 ——
这是设计文档 §10 要求的隐私边界验证。

重新生成：

```bash
bun run scripts/make-fixture.ts ~/.claude/projects/<proj>/<uuid>.jsonl \
  tests/fixtures/claude-code-basic.jsonl 200
```
```

- [ ] **Step 3: 验证脚本可运行**

Run:
```bash
printf '{"type":"user","timestamp":"2026-08-29T01:00:00.000Z","cwd":"/Users/someone/x","message":{"content":"secret code here"}}\n' > /tmp/goule-real.jsonl
bun run scripts/make-fixture.ts /tmp/goule-real.jsonl /tmp/goule-fx.jsonl 10
cat /tmp/goule-fx.jsonl
```
Expected: 输出的 JSON 中 `content` 变为 `<scrubbed:16>`，`cwd` 变为 `/Users/tester/x`，`timestamp` 与 `type` 保留

- [ ] **Step 4: 提交**

```bash
git add scripts/make-fixture.ts tests/fixtures/README.md
git commit -m "chore: 脱敏 fixture 生成脚本"
```

---

## Task 9: Claude Code adapter

设计文档 §6.3：`discover` **必须递归**——subagent 文件占 CC 文件的 45%（85/187），两层 glob 会静默漏掉近半数。§4.3：CC 的 `tool_result` 同为 `type:"user"`，**必须排除**，否则仍会把 agent 循环计入工时。

**Files:**
- Create: `src/adapters/claude-code.ts`
- Create: `tests/fixtures/claude-code-basic.jsonl`
- Create: `tests/adapters/claude-code.test.ts`

- [ ] **Step 1: 手写脱敏 fixture**

创建 `tests/fixtures/claude-code-basic.jsonl`（手写，形状对齐真实 schema）：

```
{"type":"user","userType":"external","isSidechain":false,"timestamp":"2026-08-29T01:00:00.000Z","cwd":"/Users/tester/work/acme-api","gitBranch":"main","sessionId":"aaaa-1111","message":{"role":"user","content":"<scrubbed:12>"}}
{"type":"assistant","timestamp":"2026-08-29T01:00:30.000Z","cwd":"/Users/tester/work/acme-api","gitBranch":"main","sessionId":"aaaa-1111","message":{"role":"assistant","content":"<scrubbed:40>"}}
{"type":"user","userType":"external","isSidechain":false,"timestamp":"2026-08-29T01:01:00.000Z","cwd":"/Users/tester/work/acme-api","gitBranch":"main","sessionId":"aaaa-1111","message":{"role":"user","content":[{"type":"tool_result","content":"<scrubbed:99>"}]}}
{"type":"user","userType":"external","isSidechain":true,"timestamp":"2026-08-29T01:02:00.000Z","cwd":"/Users/tester/work/acme-api","gitBranch":"main","sessionId":"aaaa-1111","message":{"role":"user","content":"<scrubbed:5>"}}
{"type":"user","userType":"external","isSidechain":false,"timestamp":"2026-08-29T01:03:00.000Z","cwd":"/Users/tester/work/acme-api","gitBranch":"main","sessionId":"aaaa-1111","message":{"role":"user","content":"<scrubbed:7>"}}
{"type":"ai-title","aiTitle":"重构扫描器","sessionId":"aaaa-1111"}
```

- [ ] **Step 2: 写失败的测试**

创建 `tests/adapters/claude-code.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { statSync } from 'node:fs'
import { claudeCode, isHumanLine } from '../../src/adapters/claude-code'

const FIXTURE = 'tests/fixtures/claude-code-basic.jsonl'

test('真人谓词：普通 user 记录算真人', () => {
  const line = '{"type":"user","userType":"external","isSidechain":false,"message":{"content":"hi"}}'
  expect(isHumanLine(line)).toBe(true)
})

test('真人谓词：tool_result 必须排除', () => {
  const line = '{"type":"user","userType":"external","isSidechain":false,"message":{"content":[{"type":"tool_result","content":"x"}]}}'
  expect(isHumanLine(line)).toBe(false)
})

test('真人谓词：subagent 记录必须排除', () => {
  const line = '{"type":"user","userType":"external","isSidechain":true,"message":{"content":"x"}}'
  expect(isHumanLine(line)).toBe(false)
})

test('真人谓词：assistant 记录不是真人', () => {
  const line = '{"type":"assistant","timestamp":"2026-08-29T01:00:00.000Z"}'
  expect(isHumanLine(line)).toBe(false)
})

test('parse 提取元数据与事件', async () => {
  const s = await claudeCode.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s).not.toBeNull()
  expect(s!.tool).toBe('claude-code')
  expect(s!.id).toBe('aaaa-1111')
  expect(s!.cwd).toBe('/Users/tester/work/acme-api')
  expect(s!.git?.branch).toBe('main')
  expect(s!.title).toBe('重构扫描器')
  expect(s!.isSidechain).toBe(false)
})

test('parse 只把 3 条中的 2 条真正的 user 记录算作 human', async () => {
  const s = await claudeCode.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  const human = s!.events.filter((e) => e.kind === 'human')
  // 5 条带 timestamp 的记录中：user 3 条，但 tool_result 与 sidechain 各排除 1 条
  expect(human).toHaveLength(2)
  expect(s!.events).toHaveLength(5)
})

test('parse 对不含时间戳的文件返回 null', async () => {
  const p = '/tmp/goule-empty.jsonl'
  await Bun.write(p, '{"type":"ai-title","aiTitle":"x","sessionId":"y"}\n')
  const s = await claudeCode.parse({ file: p, mtimeMs: Date.now() })
  expect(s).toBeNull()
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test tests/adapters/claude-code.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 4: 实现**

创建 `src/adapters/claude-code.ts`：

```ts
import { Glob } from 'bun'
import { statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { DayRange } from '../types/day'
import type { Instant } from '../types/instant'
import type { RawSession, SessionEvent } from '../types/session'
import { firstTimestamp, plausible, readLines } from './jsonl'
import type { Candidate, SessionAdapter } from './types'

const RE_TYPE_USER = /"type":\s*"user"/
const RE_EXTERNAL = /"userType":\s*"external"/
const RE_SIDECHAIN = /"isSidechain":\s*true/
const RE_TOOL_RESULT = /"type":\s*"tool_result"/
const RE_CWD = /"cwd":\s*"([^"]*)"/
const RE_BRANCH = /"gitBranch":\s*"([^"]*)"/
const RE_SESSION_ID = /"sessionId":\s*"([^"]*)"/
const RE_AI_TITLE_LINE = /"type":\s*"ai-title"/

/**
 * 真人输入判别。tool_result 与 subagent 记录都以 type:"user" 落盘，
 * 不排除就会把 agent 循环计入工时。
 */
export function isHumanLine(line: string): boolean {
  return (
    RE_TYPE_USER.test(line) &&
    RE_EXTERNAL.test(line) &&
    !RE_SIDECHAIN.test(line) &&
    !RE_TOOL_RESULT.test(line)
  )
}

/** mtime 窗口左侧放宽 1 天，避免 04:00 边界与跨午夜 session 漏扫 */
function inMtimeWindow(mtimeMs: number, range: DayRange): boolean {
  return mtimeMs >= range.start - 86_400_000 && mtimeMs <= range.end + 86_400_000
}

export const claudeCode: SessionAdapter = {
  tool: 'claude-code',

  async discover(root: string, range: DayRange): Promise<Candidate[]> {
    const out: Candidate[] = []
    // 必须递归：subagent 在 <project>/<uuid>/subagents/agent-*.jsonl，占 45% 的文件
    const glob = new Glob('**/*.jsonl')
    for await (const file of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) {
      let mtimeMs: number
      try { mtimeMs = statSync(file).mtimeMs } catch { continue }
      if (inMtimeWindow(mtimeMs, range)) out.push({ file, mtimeMs })
    }
    return out
  },

  async parse(c: Candidate): Promise<RawSession | null> {
    const events: SessionEvent[] = []
    let cwd: string | null = null
    let branch: string | null = null
    let sessionId: string | null = null
    let title: string | null = null

    for await (const line of readLines(c.file)) {
      if (title === null && RE_AI_TITLE_LINE.test(line)) {
        try {
          const rec = JSON.parse(line) as { aiTitle?: string }
          if (typeof rec.aiTitle === 'string') title = rec.aiTitle
        } catch { /* 结构异常的行不影响主流程 */ }
      }
      if (cwd === null) cwd = RE_CWD.exec(line)?.[1] ?? null
      if (branch === null) branch = RE_BRANCH.exec(line)?.[1] ?? null
      if (sessionId === null) sessionId = RE_SESSION_ID.exec(line)?.[1] ?? null

      const at: Instant | null = firstTimestamp(line)
      if (at !== null && plausible(at, c.mtimeMs)) {
        events.push({ at, kind: isHumanLine(line) ? 'human' : 'agent' })
      }
    }

    if (events.length === 0) return null

    const isSidechain = c.file.includes('/subagents/')
    return {
      id: sessionId ?? basename(c.file, '.jsonl'),
      tool: 'claude-code',
      file: c.file,
      events,
      cwd,
      git: branch === null ? null : { branch, commitHash: null, remoteUrl: null },
      title,
      isSidechain,
      // subagent 文件的父目录名即父 session uuid
      parentSessionId: isSidechain ? basename(dirname(dirname(c.file))) : null,
    }
  },
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test tests/adapters/claude-code.test.ts`
Expected: `7 pass  0 fail`

- [ ] **Step 6: 提交**

```bash
git add src/adapters/claude-code.ts tests/adapters/claude-code.test.ts tests/fixtures/claude-code-basic.jsonl
git commit -m "feat: Claude Code adapter（递归发现 + 真人谓词）"
```

---

## Task 10: Codex adapter

设计文档 §6.3：Codex 用四层 glob `sessions/YYYY/MM/DD/*.jsonl`，**不可改用递归**——根目录下的 `history.jsonl` / `session_index.jsonl` / `transcription-history.jsonl` 不是 session 文件。`session_index.jsonl` 实测仅 16 行 vs 251 个 session，索引不完整，不可用于 discover。

**Files:**
- Create: `src/adapters/codex.ts`
- Create: `tests/fixtures/codex-basic.jsonl`
- Create: `tests/adapters/codex.test.ts`

- [ ] **Step 1: 手写脱敏 fixture**

创建 `tests/fixtures/codex-basic.jsonl`：

```
{"timestamp":"2026-08-28T06:41:29.333Z","ordinal":0,"type":"session_meta","payload":{"session_id":"bbbb-2222","cwd":"/Users/tester/work/acme-api","originator":"codex-tui","cli_version":"0.150.1","git":{"commit_hash":"a38f3836ec7c2e5eecfa3cd4a07e57b524c86eb1","branch":"master","repository_url":"<scrubbed>"},"base_instructions":"<scrubbed:2048>"}}
{"timestamp":"2026-08-28T06:41:35.000Z","ordinal":1,"type":"response_item","payload":{"type":"message","role":"user","content":"<scrubbed:20>"}}
{"timestamp":"2026-08-28T06:41:40.000Z","ordinal":2,"type":"response_item","payload":{"type":"reasoning","summary":"<scrubbed:300>"}}
{"timestamp":"2026-08-28T06:41:45.551Z","ordinal":3,"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":20411,"output_tokens":156}}}}
{"timestamp":"2026-08-28T06:42:10.000Z","ordinal":4,"type":"response_item","payload":{"type":"message","role":"assistant","content":"<scrubbed:88>"}}
{"timestamp":"2026-08-28T06:43:00.000Z","ordinal":5,"type":"response_item","payload":{"type":"message","role":"developer","content":"<scrubbed:12>"}}
{"timestamp":"2026-08-28T06:44:00.000Z","ordinal":6,"type":"response_item","payload":{"type":"message","role":"user","content":"<scrubbed:9>"}}
```

- [ ] **Step 2: 写失败的测试**

创建 `tests/adapters/codex.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { statSync } from 'node:fs'
import { codex, isHumanLine } from '../../src/adapters/codex'

const FIXTURE = 'tests/fixtures/codex-basic.jsonl'

test('真人谓词：role user 算真人', () => {
  expect(isHumanLine('{"payload":{"role":"user","type":"message"}}')).toBe(true)
})

test('真人谓词：role developer 不算', () => {
  expect(isHumanLine('{"payload":{"role":"developer","type":"message"}}')).toBe(false)
})

test('真人谓词：role assistant 不算', () => {
  expect(isHumanLine('{"payload":{"role":"assistant","type":"message"}}')).toBe(false)
})

test('parse 从 session_meta 提取元数据', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s).not.toBeNull()
  expect(s!.tool).toBe('codex')
  expect(s!.id).toBe('bbbb-2222')
  expect(s!.cwd).toBe('/Users/tester/work/acme-api')
  expect(s!.git?.branch).toBe('master')
  expect(s!.git?.commitHash).toBe('a38f3836ec7c2e5eecfa3cd4a07e57b524c86eb1')
})

test('Codex 无 aiTitle，title 恒为 null', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s!.title).toBeNull()
})

test('7 条记录中只有 2 条 role=user 算 human', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s!.events).toHaveLength(7)
  expect(s!.events.filter((e) => e.kind === 'human')).toHaveLength(2)
})

test('Codex session 不是 sidechain', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s!.isSidechain).toBe(false)
  expect(s!.parentSessionId).toBeNull()
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test tests/adapters/codex.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 4: 实现**

创建 `src/adapters/codex.ts`：

```ts
import { Glob } from 'bun'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { DayRange } from '../types/day'
import type { RawSession, SessionEvent } from '../types/session'
import { firstTimestamp, plausible, readLines } from './jsonl'
import type { Candidate, SessionAdapter } from './types'

const RE_ROLE_USER = /"role":\s*"user"/
const RE_SESSION_META = /"type":\s*"session_meta"/

export function isHumanLine(line: string): boolean {
  return RE_ROLE_USER.test(line)
}

interface SessionMetaPayload {
  session_id?: string
  cwd?: string
  git?: { commit_hash?: string; branch?: string; repository_url?: string }
}

function inMtimeWindow(mtimeMs: number, range: DayRange): boolean {
  return mtimeMs >= range.start - 86_400_000 && mtimeMs <= range.end + 86_400_000
}

export const codex: SessionAdapter = {
  tool: 'codex',

  async discover(root: string, range: DayRange): Promise<Candidate[]> {
    const out: Candidate[] = []
    // 四层 glob（YYYY/MM/DD/*.jsonl）。不可改用递归：根目录下的
    // history.jsonl / session_index.jsonl 不是 session 文件。
    const glob = new Glob('*/*/*/*.jsonl')
    for await (const file of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) {
      let mtimeMs: number
      try { mtimeMs = statSync(file).mtimeMs } catch { continue }
      if (inMtimeWindow(mtimeMs, range)) out.push({ file, mtimeMs })
    }
    return out
  },

  async parse(c: Candidate): Promise<RawSession | null> {
    const events: SessionEvent[] = []
    let meta: SessionMetaPayload | null = null

    for await (const line of readLines(c.file)) {
      if (meta === null && RE_SESSION_META.test(line)) {
        try {
          const rec = JSON.parse(line) as { payload?: SessionMetaPayload }
          meta = rec.payload ?? null
        } catch { /* 结构异常不影响主流程 */ }
      }
      const at = firstTimestamp(line)
      if (at !== null && plausible(at, c.mtimeMs)) {
        events.push({ at, kind: isHumanLine(line) ? 'human' : 'agent' })
      }
    }

    if (events.length === 0) return null

    const git = meta?.git
    return {
      id: meta?.session_id ?? basename(c.file, '.jsonl'),
      tool: 'codex',
      file: c.file,
      events,
      cwd: meta?.cwd ?? null,
      git: git
        ? {
            branch: git.branch ?? null,
            commitHash: git.commit_hash ?? null,
            remoteUrl: git.repository_url ?? null,
          }
        : null,
      title: null, // Codex 无 aiTitle，缺失如实建模，交给润色层补
      isSidechain: false,
      parentSessionId: null,
    }
  },
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test tests/adapters/codex.test.ts`
Expected: `7 pass  0 fail`

- [ ] **Step 6: 提交**

```bash
git add src/adapters/codex.ts tests/adapters/codex.test.ts tests/fixtures/codex-basic.jsonl
git commit -m "feat: Codex adapter（session_meta + 四层 glob）"
```

---

## Task 11: Activity 聚合（hands_on / agent 拆分）

设计文档 §4.4：两个量**永不相加**。`agent_minutes` 是产出杠杆指标，不是工时。

**Files:**
- Create: `src/timeline/activity.ts`
- Create: `tests/timeline/activity.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/timeline/activity.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/timeline/activity.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/timeline/activity.ts`：

```ts
import type { DayRange } from '../types/day'
import { MINUTE_MS, type Tz } from '../types/instant'
import { agentTimes, humanTimes, type RawSession, type ToolId } from '../types/session'
import { toBlocks, type Block } from './blocks'
import { byHour, clipTo, totalMinutes, union } from './union'

export interface ActivityConfig {
  idleGapMinutes: number
  minBlockCreditSeconds: number
  tz: Tz
}

export interface HandsOn {
  blocks: Block[]
  minutes: number
  byHour: number[]
  sources: ToolId[]
}

export interface AgentActivity {
  blocks: Block[]
  minutes: number
}

export interface Activity {
  handsOn: HandsOn
  agent: AgentActivity
}

function collect(
  sessions: RawSession[],
  pick: (s: RawSession) => number[],
  range: DayRange,
  cfg: ActivityConfig,
): Block[] {
  const idleGapMs = cfg.idleGapMinutes * MINUTE_MS
  const creditMs = cfg.minBlockCreditSeconds * 1000
  const all: Block[] = []
  for (const s of sessions) all.push(...toBlocks(pick(s), idleGapMs, creditMs))
  return clipTo(union(all), range)
}

/**
 * hands_on 与 agent 分别聚合。
 * agent.minutes 定义为「全量锚点时长 − hands_on 时长」，
 * 保证两者相加恒等于全量，且各自含义不被污染。永远不要把两者相加当工时。
 */
export function buildActivity(
  sessions: RawSession[],
  range: DayRange,
  cfg: ActivityConfig,
): Activity {
  const handsOnBlocks = collect(sessions, humanTimes, range, cfg)
  const allBlocks = collect(sessions, agentTimes, range, cfg)

  const handsOnMinutes = totalMinutes(handsOnBlocks)
  const allMinutes = totalMinutes(allBlocks)

  const sources = [...new Set(sessions.map((s) => s.tool))].sort()

  return {
    handsOn: {
      blocks: handsOnBlocks,
      minutes: handsOnMinutes,
      byHour: byHour(handsOnBlocks, cfg.tz),
      sources,
    },
    agent: {
      blocks: allBlocks,
      minutes: Math.max(0, allMinutes - handsOnMinutes),
    },
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/timeline/activity.test.ts`
Expected: `8 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/timeline/activity.ts tests/timeline/activity.test.ts
git commit -m "feat: activity 聚合与 hands_on/agent 拆分"
```

---

## Task 12: 配置类型与默认值

设计文档 §9。

**Files:**
- Create: `src/types/config.ts`
- Create: `tests/types/config.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/types/config.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { DEFAULT_CONFIG, resolveTz } from '../../src/types/config'

test('默认逻辑日 cutoff 为 04:00', () => {
  expect(DEFAULT_CONFIG.dayCutoffHour).toBe(4)
})

test('默认 idle 阈值 10 分钟', () => {
  expect(DEFAULT_CONFIG.idleGapMinutes).toBe(10)
})

test('压力债半衰期默认 3 天', () => {
  expect(DEFAULT_CONFIG.stress.halfLifeDays).toBe(3)
})

test('基线冷启动门槛 14 天', () => {
  expect(DEFAULT_CONFIG.stress.baselineMinDays).toBe(14)
})

test('resolveTz 对 auto 返回系统时区', () => {
  expect(resolveTz('auto')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
})

test('resolveTz 透传显式时区', () => {
  expect(resolveTz('Asia/Shanghai')).toBe('Asia/Shanghai')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/types/config.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/types/config.ts`：

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Tz } from './instant'

export interface StressConfig {
  halfLifeDays: number
  lateNightWindow: [number, number]
  lateNightMinutes: number
  shortRecoveryHours: number
  consecutiveDays: number
  weekendMinutes: number
  noBreakBlockMinutes: number
  baselineWindowDays: number
  baselineMinDays: number
}

export interface Config {
  dayCutoffHour: number
  idleGapMinutes: number
  minBlockCreditSeconds: number
  timezone: string
  sources: {
    claudeCode: { enabled: boolean; root: string }
    codex: { enabled: boolean; root: string }
  }
  stress: StressConfig
}

export const DEFAULT_CONFIG: Config = {
  dayCutoffHour: 4,
  idleGapMinutes: 10,
  minBlockCreditSeconds: 60,
  timezone: 'auto',
  sources: {
    claudeCode: { enabled: true, root: join(homedir(), '.claude', 'projects') },
    codex: { enabled: true, root: join(homedir(), '.codex', 'sessions') },
  },
  stress: {
    halfLifeDays: 3,
    lateNightWindow: [23, 6],
    lateNightMinutes: 30,
    shortRecoveryHours: 8,
    consecutiveDays: 6,
    weekendMinutes: 60,
    noBreakBlockMinutes: 120,
    baselineWindowDays: 30,
    baselineMinDays: 14,
  },
}

export function resolveTz(timezone: string): Tz {
  if (timezone === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone
  return timezone
}

export const GOULE_DIR = join(homedir(), '.goule')
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/types/config.test.ts`
Expected: `6 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/types/config.ts tests/types/config.test.ts
git commit -m "feat: 配置类型与默认值"
```

---

## Task 13: 压力基线

设计文档 §5.2：`overlong_day` 用**个人历史 P90** 而非硬编码工时，落实「不硬编码 996 标准」。历史不足 14 天时该信号不参与。

**Files:**
- Create: `src/stress/baseline.ts`
- Create: `tests/stress/baseline.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/stress/baseline.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/stress/baseline.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/stress/baseline.ts`：

```ts
export interface Baseline {
  handsOnP90: number
  windowDays: number
  sufficient: boolean
}

/** 线性插值分位数。空数组返回 0。 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]!
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

/**
 * 个人 hands_on 基线。
 * 用用户自己的历史分布，而非硬编码工时 —— 这是 PRD「不硬编码 996 标准」的落点。
 */
export function computeBaseline(
  dailyHandsOnMinutes: number[],
  windowDays: number,
  minDays: number,
): Baseline {
  const window = dailyHandsOnMinutes.slice(-windowDays)
  const active = window.filter((m) => m > 0)
  return {
    handsOnP90: percentile(active, 0.9),
    windowDays,
    sufficient: active.length >= minDays,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/stress/baseline.test.ts`
Expected: `8 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/stress/baseline.ts tests/stress/baseline.test.ts
git commit -m "feat: 个人 hands_on 基线与冷启动判定"
```

---

## Task 14: 压力信号求值

设计文档 §5.2 的 7 个信号。全部锚定 hands_on —— agent 跑一整夜不会让人疲劳。

**Files:**
- Create: `src/stress/signals.ts`
- Create: `tests/stress/signals.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/stress/signals.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/stress/signals.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/stress/signals.ts`：

```ts
import type { StressConfig } from '../types/config'
import type { Baseline } from './baseline'

export type SignalId =
  | 'late_night' | 'past_midnight' | 'short_recovery'
  | 'consecutive_days' | 'overlong_day' | 'weekend_work' | 'no_break_block'

export interface Signal {
  id: SignalId
  fired: boolean
  value: number
  threshold: number
  daysAgo: number
}

export interface DayInput {
  dayId: string
  handsOnMinutes: number
  lateNightMinutes: number
  crossesMidnight: boolean
  /** 前一日末锚点 → 本日首锚点的小时数；无前一日数据为 null */
  recoveryHours: number | null
  consecutiveDays: number
  isWeekend: boolean
  longestBlockMinutes: number
}

/** 各信号的债务权重。总和用于把 debt 归一到 0..1。 */
export const SIGNAL_WEIGHTS: Record<SignalId, number> = {
  late_night: 3,
  past_midnight: 2,
  short_recovery: 3,
  consecutive_days: 2,
  overlong_day: 2,
  weekend_work: 1,
  no_break_block: 1,
}

export function evaluateSignals(d: DayInput, baseline: Baseline, cfg: StressConfig): Signal[] {
  const mk = (id: SignalId, fired: boolean, value: number, threshold: number): Signal =>
    ({ id, fired, value, threshold, daysAgo: 0 })

  return [
    mk('late_night', d.lateNightMinutes > cfg.lateNightMinutes,
       d.lateNightMinutes, cfg.lateNightMinutes),

    mk('past_midnight', d.crossesMidnight, d.crossesMidnight ? 1 : 0, 1),

    mk('short_recovery',
       d.recoveryHours !== null && d.recoveryHours < cfg.shortRecoveryHours,
       d.recoveryHours ?? -1, cfg.shortRecoveryHours),

    mk('consecutive_days', d.consecutiveDays >= cfg.consecutiveDays,
       d.consecutiveDays, cfg.consecutiveDays),

    // 基线不足时该信号不参与，避免新用户被无意义基线误判
    mk('overlong_day',
       baseline.sufficient && d.handsOnMinutes > baseline.handsOnP90,
       d.handsOnMinutes, baseline.sufficient ? baseline.handsOnP90 : Infinity),

    mk('weekend_work', d.isWeekend && d.handsOnMinutes > cfg.weekendMinutes,
       d.isWeekend ? d.handsOnMinutes : 0, cfg.weekendMinutes),

    mk('no_break_block', d.longestBlockMinutes > cfg.noBreakBlockMinutes,
       d.longestBlockMinutes, cfg.noBreakBlockMinutes),
  ]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/stress/signals.test.ts`
Expected: `11 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/stress/signals.ts tests/stress/signals.test.ts
git commit -m "feat: 7 个压力信号求值"
```

---

## Task 15: 压力债（半衰模型）

设计文档 §5.2：用半衰而非「连续 N 天」窗口，因为恢复是渐进的——昨天熬夜比三天前熬夜欠得多，而三天前的透支不应突然归零。

**Files:**
- Create: `src/stress/debt.ts`
- Create: `tests/stress/debt.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/stress/debt.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/stress/debt.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/stress/debt.ts`：

```ts
import { SIGNAL_WEIGHTS, type Signal } from './signals'

const TOTAL_WEIGHT = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0)

/**
 * 压力债：Σ weight × 0.5^(daysAgo / halfLifeDays)，归一到 0..1。
 *
 * 用半衰而非固定窗口，因为恢复是渐进的：昨天熬夜比三天前熬夜欠得多，
 * 而三天前的透支也不应在第四天突然归零。
 *
 * 归一分母取「全部信号在今天触发」的权重和，因此单日全触发恰好得 1。
 * 历史累积可能超过 1，故封顶。
 */
export function computeDebt(signals: Signal[], halfLifeDays: number): number {
  let sum = 0
  for (const s of signals) {
    if (!s.fired) continue
    const weight = SIGNAL_WEIGHTS[s.id]
    sum += weight * Math.pow(0.5, s.daysAgo / halfLifeDays)
  }
  return Math.min(1, sum / TOTAL_WEIGHT)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/stress/debt.test.ts`
Expected: `7 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/stress/debt.ts tests/stress/debt.test.ts
git commit -m "feat: 半衰压力债模型"
```

---

## Task 16: 编排 scan

把 discover → parse → activity → stress 串起来。历史天数用于基线与连续天数，通过一次多日扫描获得。

**Files:**
- Create: `src/scan.ts`
- Create: `tests/scan.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/scan.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/scan.test.ts`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现**

创建 `src/scan.ts`：

```ts
import { claudeCode } from './adapters/claude-code'
import { codex } from './adapters/codex'
import type { SessionAdapter } from './adapters/types'
import { computeBaseline, type Baseline } from './stress/baseline'
import { computeDebt } from './stress/debt'
import { evaluateSignals, type DayInput, type Signal } from './stress/signals'
import { buildActivity, type Activity } from './timeline/activity'
import type { Block } from './timeline/blocks'
import { MINUTE_MS, localDate, localParts, type Instant, type Tz } from './types/instant'
import { dayRange, isWeekend, logicalDay, type DayRange } from './types/day'
import { resolveTz, type Config } from './types/config'
import type { RawSession } from './types/session'

export interface DayFactsLite {
  schemaVersion: 1
  dayId: string
  boundary: { start: Instant; end: Instant; cutoffHour: number; tz: Tz }
  generatedAt: Instant
  activity: Activity
  stress: { signals: Signal[]; debt: number; baseline: Baseline }
  sessions: Array<Pick<RawSession, 'id' | 'tool' | 'title' | 'cwd' | 'isSidechain'> & {
    branch: string | null
    minutes: number
  }>
}

/** 以 dayId 结尾、向前数连续有活动的天数。当日无活动则为 0。 */
export function consecutiveDaysEndingAt(dayId: string, activeDays: Set<string>): number {
  if (!activeDays.has(dayId)) return 0
  let count = 0
  const [y, m, d] = dayId.split('-').map(Number)
  const cursor = new Date(Date.UTC(y!, m! - 1, d!))
  while (true) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
    if (!activeDays.has(key)) break
    count++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return count
}

export interface DeriveArgs {
  dayId: string
  range: DayRange
  tz: Tz
  handsOnBlocks: Block[]
  handsOnMinutes: number
  prevDayLastAnchor: Instant | null
  activeDays: Set<string>
  lateNightWindow: [number, number]
}

function inLateNight(hour: number, [from, to]: [number, number]): boolean {
  return from > to ? hour >= from || hour < to : hour >= from && hour < to
}

export function deriveDayInput(a: DeriveArgs): DayInput {
  let lateNightMinutes = 0
  let crossesMidnight = false
  let longestBlockMinutes = 0

  for (const b of a.handsOnBlocks) {
    longestBlockMinutes = Math.max(longestBlockMinutes, (b.end - b.start) / MINUTE_MS)
    if (localDate(b.start, a.tz) !== localDate(b.end, a.tz)) crossesMidnight = true

    let cur = b.start
    while (cur < b.end) {
      const p = localParts(cur, a.tz)
      const msToNextHour = ((59 - p.minute) * 60 + (60 - p.second)) * 1000
      const next = Math.min(b.end, cur + msToNextHour)
      const step = next - cur
      if (step <= 0) { cur += MINUTE_MS; continue }
      if (inLateNight(p.hour, a.lateNightWindow)) lateNightMinutes += step / MINUTE_MS
      cur = next
    }
  }

  const firstAnchor = a.handsOnBlocks[0]?.start ?? null
  const recoveryHours =
    a.prevDayLastAnchor !== null && firstAnchor !== null
      ? (firstAnchor - a.prevDayLastAnchor) / 3_600_000
      : null

  return {
    dayId: a.dayId,
    handsOnMinutes: a.handsOnMinutes,
    lateNightMinutes,
    crossesMidnight,
    recoveryHours,
    consecutiveDays: consecutiveDaysEndingAt(a.dayId, a.activeDays),
    isWeekend: isWeekend(a.dayId),
    longestBlockMinutes,
  }
}

function adaptersFor(cfg: Config): Array<{ adapter: SessionAdapter; root: string }> {
  const out: Array<{ adapter: SessionAdapter; root: string }> = []
  if (cfg.sources.claudeCode.enabled) out.push({ adapter: claudeCode, root: cfg.sources.claudeCode.root })
  if (cfg.sources.codex.enabled) out.push({ adapter: codex, root: cfg.sources.codex.root })
  return out
}

/** 扫描一个逻辑日；historyDays 用于基线与连续天数，会额外扫描更宽的窗口。 */
export async function scanDay(dayId: string, cfg: Config): Promise<DayFactsLite> {
  const tz = resolveTz(cfg.timezone)
  const range = dayRange(dayId, cfg.dayCutoffHour, tz)

  // 历史窗口：为基线与连续天数多扫 baselineWindowDays 天
  const historyStart = range.start - cfg.stress.baselineWindowDays * 86_400_000
  const wide: DayRange = { ...range, start: historyStart }

  const sessions: RawSession[] = []
  for (const { adapter, root } of adaptersFor(cfg)) {
    let candidates
    try { candidates = await adapter.discover(root, wide) } catch { continue }
    for (const c of candidates) {
      const s = await adapter.parse(c)
      if (s) sessions.push(s)
    }
  }

  const activity = buildActivity(sessions, range, {
    idleGapMinutes: cfg.idleGapMinutes,
    minBlockCreditSeconds: cfg.minBlockCreditSeconds,
    tz,
  })

  // 历史逐日 hands_on：用于基线、活跃日集合、前一日末锚点
  const perDay = new Map<string, { minutes: number; last: Instant }>()
  for (const s of sessions) {
    for (const e of s.events) {
      if (e.kind !== 'human') continue
      const d = logicalDay(e.at, cfg.dayCutoffHour, tz)
      const cur = perDay.get(d)
      if (!cur) perDay.set(d, { minutes: 0, last: e.at })
      else if (e.at > cur.last) cur.last = e.at
    }
  }
  for (const [d, v] of perDay) {
    const r = dayRange(d, cfg.dayCutoffHour, tz)
    const a = buildActivity(sessions, r, {
      idleGapMinutes: cfg.idleGapMinutes,
      minBlockCreditSeconds: cfg.minBlockCreditSeconds,
      tz,
    })
    v.minutes = a.handsOn.minutes
  }

  const activeDays = new Set([...perDay.keys()].filter((d) => (perDay.get(d)?.minutes ?? 0) > 0))
  const orderedDays = [...perDay.keys()].sort()
  const dailyMinutes = orderedDays.filter((d) => d < dayId).map((d) => perDay.get(d)!.minutes)
  const baseline = computeBaseline(dailyMinutes, cfg.stress.baselineWindowDays, cfg.stress.baselineMinDays)

  const prevDay = orderedDays.filter((d) => d < dayId).pop()
  const prevDayLastAnchor = prevDay ? perDay.get(prevDay)!.last : null

  // 每个 session 自己的 hands_on 时长（未并集，仅用于展示各 session 的投入）
  const perSessionMinutes = new Map<string, number>()
  for (const s of sessions) {
    perSessionMinutes.set(s.file, buildActivity([s], range, {
      idleGapMinutes: cfg.idleGapMinutes,
      minBlockCreditSeconds: cfg.minBlockCreditSeconds,
      tz,
    }).handsOn.minutes)
  }

  const dayInput = deriveDayInput({
    dayId, range, tz,
    handsOnBlocks: activity.handsOn.blocks,
    handsOnMinutes: activity.handsOn.minutes,
    prevDayLastAnchor,
    activeDays,
    lateNightWindow: cfg.stress.lateNightWindow,
  })

  const signals = evaluateSignals(dayInput, baseline, cfg.stress)
  const debt = computeDebt(signals, cfg.stress.halfLifeDays)

  return {
    schemaVersion: 1,
    dayId,
    boundary: { start: range.start, end: range.end, cutoffHour: cfg.dayCutoffHour, tz },
    generatedAt: Date.now(),
    activity,
    stress: { signals, debt, baseline },
    sessions: sessions.map((s) => ({
      id: s.id, tool: s.tool, title: s.title, cwd: s.cwd,
      isSidechain: s.isSidechain, branch: s.git?.branch ?? null,
      minutes: perSessionMinutes.get(s.file) ?? 0,
    })),
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/scan.test.ts`
Expected: `7 pass  0 fail`

- [ ] **Step 5: 提交**

```bash
git add src/scan.ts tests/scan.test.ts
git commit -m "feat: scan 编排（activity + stress）"
```

---

## Task 17: 接上 CLI 的 scan 与 doctor

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 实现 doctor 与 scan**

把 `src/index.ts` 中 `case "scan"` 与 `case "doctor"` 的占位实现替换为真实逻辑。完整替换后的文件：

```ts
#!/usr/bin/env bun

import { existsSync, statSync } from 'node:fs'
import { Glob } from 'bun'
import { DEFAULT_CONFIG, resolveTz } from './types/config'
import { logicalDay } from './types/day'
import { scanDay } from './scan'

const command = Bun.argv[2] ?? "help";

const help = `够了·到点下班（Goule）\n\nPhase 1（事实层）：\n  goule report [--date today] [--format md|json] [--polish] [--dry-run]\n  goule scan   [--date today]     输出原始 DayFacts JSON\n  goule notes  [--date today]     用 $EDITOR 编辑当日笔记\n  goule doctor                    数据源可达性诊断\n\nPhase 2（规则引擎，尚未实现）：\n  goule init / check / rules / dashboard\n\n当前版本：项目骨架（Spec-First）\n设计文档：docs/superpowers/specs/2026-08-29-goule-phase1-design.md\n`;

const phase2 = (name: string) =>
  console.error(`\`goule ${name}\` 属于 Phase 2（规则引擎），尚未实现。\n首期只呈现事实，不下结论 —— 试试 \`goule report\`。`);

function argValue(flag: string): string | null {
  const i = Bun.argv.indexOf(flag)
  return i >= 0 ? (Bun.argv[i + 1] ?? null) : null
}

function targetDay(): string {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const raw = argValue('--date')
  if (raw === null || raw === 'today') {
    return logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, tz)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error(`--date 需为 YYYY-MM-DD 或 today，收到：${raw}`)
    process.exit(1)
  }
  return raw
}

async function countJsonl(root: string, pattern: string): Promise<number> {
  let n = 0
  const glob = new Glob(pattern)
  for await (const _ of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) n++
  return n
}

async function doctor(): Promise<void> {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  console.log(`时区        ${tz}`)
  console.log(`逻辑日切点  ${DEFAULT_CONFIG.dayCutoffHour}:00`)
  console.log(`今日        ${logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, tz)}`)
  console.log('')

  const rows: Array<[string, string, string]> = []
  for (const [name, src, pattern] of [
    ['Claude Code', DEFAULT_CONFIG.sources.claudeCode, '**/*.jsonl'],
    ['Codex', DEFAULT_CONFIG.sources.codex, '*/*/*/*.jsonl'],
  ] as const) {
    if (!src.enabled) { rows.push([name, '已禁用', src.root]); continue }
    if (!existsSync(src.root)) { rows.push([name, '✗ 目录不存在', src.root]); continue }
    try {
      statSync(src.root)
      const n = await countJsonl(src.root, pattern)
      rows.push([name, `✓ ${n} 个 session 文件`, src.root])
    } catch (e) {
      rows.push([name, `✗ 不可读：${(e as Error).message}`, src.root])
    }
  }
  for (const [name, status, root] of rows) {
    console.log(`${name.padEnd(12)}${status.padEnd(26)}${root}`)
  }
}

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(help);
    break;
  case "report":
    console.log("Goule 日报渲染器即将实现。");
    break;
  case "scan": {
    const facts = await scanDay(targetDay(), DEFAULT_CONFIG)
    process.stdout.write(JSON.stringify(facts, null, 2) + '\n')
    break;
  }
  case "notes":
    console.log("Goule 笔记编辑即将实现。数据目录：~/.goule/notes/");
    break;
  case "doctor":
    await doctor()
    break;
  case "init":
  case "check":
  case "rules":
  case "dashboard":
    phase2(command);
    process.exitCode = 1;
    break;
  default:
    console.error(`未知命令：${command}\n`);
    process.stdout.write(help);
    process.exitCode = 1;
}
```

- [ ] **Step 2: 验证 doctor 在真实机器上可跑**

Run: `bun run src/index.ts doctor`
Expected: 打印时区、逻辑日切点、今日 dayId，以及两个数据源的文件计数（若本机装了 Claude Code / Codex 应为 `✓ N 个 session 文件`；未装则为 `✗ 目录不存在`，同样是正确输出）

- [ ] **Step 3: 验证 scan 在真实数据上可跑**

Run: `bun run src/index.ts scan --date 2026-08-28 | head -40`
Expected: 输出 JSON，含 `dayId`、`activity.handsOn.minutes`、`activity.agent.minutes`、`stress.signals`（7 条）、`stress.debt`

- [ ] **Step 4: 人工核对口径**

Run:
```bash
bun run src/index.ts scan --date 2026-08-28 \
  | grep -E '"minutes"|"debt"|"handsOnP90"' | head -5
```
Expected: `handsOn.minutes` 应显著小于 `agent.minutes`。若两者接近或 handsOn 异常大，说明真人谓词有误，回到 Task 9 / Task 10 检查。

- [ ] **Step 5: 全量校验并提交**

Run: `bun run typecheck && bun test`
Expected: typecheck 通过；全部测试 pass

```bash
git add src/index.ts
git commit -m "feat: 接上 scan 与 doctor 命令"
```

---

## Task 18: 真实数据回归断言

设计文档 §10 要求：本机 36 天样本上 `late_night` 触发 ≤ 2 次，过度触发即为回归。该测试依赖本机真实数据，故设计为**存在数据才运行**。

**验收基准（本计划的 adapter 在真实数据上实测，近 3 天样本）：**

| 指标 | Claude Code | Codex |
| --- | --- | --- |
| 真人事件占全部事件 | **2.84%** | **0.53%** |
| 有 `title` 的 session | 21 / 26 | **0 / 21**（Codex 无 aiTitle） |
| 有 `branch` 的 session | 26 / 26 | 15 / 21 |
| 识别出 subagent | 1 | 0 |

若实现后真人占比显著高于上表（例如 > 10%），说明谓词退化——最可能是漏排除
`tool_result`。设计文档 §4.3 记录的 8.89% 是**粗谓词**下的上界；本计划的精确
谓词收敛到 2.84%，两者不矛盾。

**Files:**
- Create: `tests/regression/real-data.test.ts`

- [ ] **Step 1: 写测试**

创建 `tests/regression/real-data.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { DEFAULT_CONFIG, resolveTz } from '../../src/types/config'
import { logicalDay } from '../../src/types/day'
import { scanDay } from '../../src/scan'

const hasRealData =
  existsSync(DEFAULT_CONFIG.sources.claudeCode.root) ||
  existsSync(DEFAULT_CONFIG.sources.codex.root)

test.skipIf(!hasRealData)('真实数据：hands_on 必须显著小于 agent', async () => {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const day = logicalDay(Date.now() - 86_400_000, DEFAULT_CONFIG.dayCutoffHour, tz)
  const facts = await scanDay(day, DEFAULT_CONFIG)

  // 实测真人输入仅占全部记录的 8.89%。若 hands_on 接近 agent，
  // 说明真人谓词退化（例如漏排除 tool_result），这是必须捕获的回归。
  if (facts.activity.agent.minutes > 60) {
    expect(facts.activity.handsOn.minutes).toBeLessThan(facts.activity.agent.minutes)
  }
}, 120_000)

test.skipIf(!hasRealData)('真实数据：单日 hands_on 不应超过 16 小时', async () => {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const day = logicalDay(Date.now() - 86_400_000, DEFAULT_CONFIG.dayCutoffHour, tz)
  const facts = await scanDay(day, DEFAULT_CONFIG)
  expect(facts.activity.handsOn.minutes).toBeLessThan(16 * 60)
}, 120_000)

test.skipIf(!hasRealData)('真实数据：signals 恒为 7 条，debt 落在 [0,1]', async () => {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const day = logicalDay(Date.now() - 86_400_000, DEFAULT_CONFIG.dayCutoffHour, tz)
  const facts = await scanDay(day, DEFAULT_CONFIG)
  expect(facts.stress.signals).toHaveLength(7)
  expect(facts.stress.debt).toBeGreaterThanOrEqual(0)
  expect(facts.stress.debt).toBeLessThanOrEqual(1)
}, 120_000)
```

- [ ] **Step 2: 运行**

Run: `bun test tests/regression/real-data.test.ts`
Expected: 本机有真实数据时 `3 pass`；CI 上无数据时 `3 skip`

- [ ] **Step 3: 全量校验**

Run: `bun run typecheck && bun test`
Expected: typecheck 通过；全部测试 pass，无 fail

- [ ] **Step 4: 提交**

```bash
git add tests/regression/real-data.test.ts
git commit -m "test: 真实数据回归断言（hands_on/agent 口径）"
```

---

## 后续计划（不在本计划范围）

| 计划 | 覆盖 | 交付 |
| --- | --- | --- |
| Phase 1 计划二 | 设计文档 M3–M4：git 扫描、Conventional Commits 分类、join（exact/heuristic 两档）、孤儿桶、日报渲染、`report` / `notes` | `goule report` 输出完整日报 |
| Phase 1 计划三 | 设计文档 M5：润色层、`PolishInput` 投影、两档 redaction、`--dry-run`、隐私断言 | 可选 LLM 润色 |

本计划完成后，`RawSession` 需补充 `tokens` / `models` / `turns` 字段以支撑日报渲染——按 YAGNI 原则留到计划二，届时为纯增量改动。
