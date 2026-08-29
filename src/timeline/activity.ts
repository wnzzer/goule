import type { DayRange } from '../types/day'
import { MINUTE_MS, type Tz } from '../types/instant'
import { emptyMouseActivity } from '../mouse/aggregate'
import type { MouseActivity } from '../mouse/types'
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
  mouseClicks: MouseActivity
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
  mouseClicks: MouseActivity = emptyMouseActivity(),
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
    mouseClicks,
  }
}
