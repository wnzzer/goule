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
