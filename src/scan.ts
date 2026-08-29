import { claudeCode } from './adapters/claude-code'
import { codex } from './adapters/codex'
import type { SessionAdapter } from './adapters/types'
import { computeBaseline, type Baseline } from './stress/baseline'
import { computeDebt } from './stress/debt'
import { evaluateSignals, type DayInput, type Signal } from './stress/signals'
import { buildActivity, type Activity } from './timeline/activity'
import type { Block } from './timeline/blocks'
import { loadMouseActivity } from './mouse/storage'
import type { MouseProvider } from './mouse/types'
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
  }, loadMouseActivity(dayId, cfg.mouse.enabled, cfg.mouse.enabled
    ? (cfg.mouse.provider === 'auto'
      ? (process.platform === 'darwin' ? 'macos-cgevent' : process.platform === 'linux' ? 'linux-evdev' : null)
      : cfg.mouse.provider as MouseProvider)
    : null))

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
