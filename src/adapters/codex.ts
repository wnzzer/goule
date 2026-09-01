import { statSync } from 'node:fs'
import { basename } from 'node:path'
import { findFiles } from '../runtime/files'
import type { DayRange } from '../types/day'
import { diffTokens, emptyTokens, type RawSession, type SessionEvent, type TokenEvent, type TokenUsage } from '../types/session'
import { firstTimestamp, plausible, readLines } from './jsonl'
import type { Candidate, SessionAdapter } from './types'

const RE_ROLE_USER = /"role":\s*"user"/
const RE_SESSION_META = /"type":\s*"session_meta"/
const RE_TOKEN_COUNT = /"total_token_usage"\s*:/

interface CodexTokenUsage {
  input_tokens?: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
  output_tokens?: number
  reasoning_output_tokens?: number
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * total_token_usage 是**会话累计值**，每条 token_count 都重复上报全量。
 * 相加会随消息条数线性虚高，只能取最后一条。
 *
 * Codex 的 input_tokens 含 cached_input_tokens，这里减掉，让 input 统一表示
 * 「新鲜输入」，与 Claude Code 的 input_tokens 可比、可相加。
 */
export function parseTokenLine(line: string): TokenUsage | null {
  if (!RE_TOKEN_COUNT.test(line)) return null
  let rec: { payload?: { info?: { total_token_usage?: CodexTokenUsage } } }
  try { rec = JSON.parse(line) } catch { return null }
  const u = rec.payload?.info?.total_token_usage
  if (!u) return null
  const cacheRead = n(u.cached_input_tokens)
  return {
    input: Math.max(0, n(u.input_tokens) - cacheRead),
    output: n(u.output_tokens),
    cacheRead,
    cacheWrite: n(u.cache_write_input_tokens),
    reasoning: n(u.reasoning_output_tokens),
  }
}

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
    for (const file of await findFiles(root, { extension: '.jsonl', exactDepth: 4 })) {
      let mtimeMs: number
      try { mtimeMs = statSync(file).mtimeMs } catch { continue }
      if (inMtimeWindow(mtimeMs, range)) out.push({ file, mtimeMs })
    }
    return out
  },

  async parse(c: Candidate): Promise<RawSession | null> {
    const events: SessionEvent[] = []
    let meta: SessionMetaPayload | null = null
    const tokenEvents: TokenEvent[] = []
    let prevCumulative: TokenUsage = emptyTokens()

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

        // 累计快照转增量：相加会随消息条数线性虚高
        const cumulative = parseTokenLine(line)
        if (cumulative) {
          const delta = diffTokens(cumulative, prevCumulative)
          prevCumulative = cumulative
          tokenEvents.push({ at, usage: delta })
        }
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
      tokenEvents,
      isSidechain: false,
      parentSessionId: null,
    }
  },
}
