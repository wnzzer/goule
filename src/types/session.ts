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
