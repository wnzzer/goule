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
