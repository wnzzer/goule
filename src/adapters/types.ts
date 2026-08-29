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
