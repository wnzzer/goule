import type { Block } from '../timeline/blocks'
import type { RawSession } from '../types/session'
import { commitsAfter, isWithinRepo } from './scanner'
import type { GitCommit, RepoDay } from './types'

export interface JoinSession {
  session: RawSession
  minutes: number
  blocks?: Block[]
}

export interface JoinedFact {
  repo: string
  branch: string | null
  minutes: number
  sessionIds: string[]
  commitShas: string[]
  confidence: 'exact' | 'heuristic'
}

export interface UnattributedSession {
  id: string
  tool: RawSession['tool']
  title: string | null
  cwd: string | null
  branch: string | null
  minutes: number
  isSidechain: boolean
}

export interface UnattributedCommit extends GitCommit {
  repo: string
}

export interface JoinResult {
  joined: JoinedFact[]
  unattributed: {
    sessions: UnattributedSession[]
    commits: UnattributedCommit[]
  }
}

interface SessionEntry extends JoinSession {
  repo: RepoDay
  branch: string | null
  start: number
  end: number
  row: JoinedFact
}

function repoForSession(repos: RepoDay[], cwd: string | null): RepoDay | null {
  return repos
    .filter((repo) => isWithinRepo(repo.path, cwd))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? null
}

function timeWindow(session: RawSession, idleGapMs: number): { start: number; end: number } | null {
  const times = session.events.map((event) => event.at)
  if (times.length === 0) return null
  const start = Math.min(...times)
  const end = Math.max(...times)
  return { start, end: end + idleGapMs }
}

function sessionRef(entry: JoinSession): UnattributedSession {
  const s = entry.session
  return {
    id: s.id,
    tool: s.tool,
    title: s.title,
    cwd: s.cwd,
    branch: s.git?.branch ?? null,
    minutes: entry.minutes,
    isSidechain: s.isSidechain,
  }
}

function rowKey(repo: RepoDay, branch: string | null, confidence: JoinedFact['confidence']): string {
  return `${repo.path}\u0000${branch ?? ''}\u0000${confidence}`
}

function addCommit(row: JoinedFact, commit: GitCommit): void {
  if (!row.commitShas.includes(commit.sha)) row.commitShas.push(commit.sha)
}

function distanceToWindow(entry: SessionEntry, ts: number): number {
  if (ts < entry.start) return entry.start - ts
  if (ts > entry.end) return ts - entry.end
  return 0
}

/**
 * 纯 join：调用方可把 Codex 的 commit_hash..HEAD 结果作为 exactByFile 传入。
 * 未命中的提交再尝试 branch + 时间窗启发式关联，未能关联的进入孤儿桶。
 */
export function joinSessionsAndCommits(
  repos: RepoDay[],
  sessions: JoinSession[],
  exactByFile: Map<string, Set<string>> = new Map(),
  idleGapMs = 10 * 60_000,
): JoinResult {
  const rows = new Map<string, JoinedFact>()
  const entries: SessionEntry[] = []
  const unattributedSessions: UnattributedSession[] = []

  for (const item of sessions) {
    // subagent 与父 session 的活动区间必然重叠，不重复计入 Git 关联。
    if (item.session.isSidechain) continue
    const repo = repoForSession(repos, item.session.cwd)
    if (!repo) {
      unattributedSessions.push(sessionRef(item))
      continue
    }
    const window = timeWindow(item.session, idleGapMs)
    if (!window) continue
    const confidence: JoinedFact['confidence'] = exactByFile.has(item.session.file) ? 'exact' : 'heuristic'
    const branch = item.session.git?.branch ?? null
    const key = rowKey(repo, branch, confidence)
    let row = rows.get(key)
    if (!row) {
      row = {
        repo: repo.name,
        branch,
        minutes: 0,
        sessionIds: [],
        commitShas: [],
        confidence,
      }
      rows.set(key, row)
    }
    row.minutes += item.minutes
    if (!row.sessionIds.includes(item.session.id)) row.sessionIds.push(item.session.id)
    entries.push({ ...item, repo, branch, ...window, row })
  }

  const exactCandidates = new Map<string, SessionEntry[]>()
  for (const entry of entries) {
    const exact = exactByFile.get(entry.session.file)
    if (!exact) continue
    for (const commit of entry.repo.commits) {
      if (!exact.has(commit.sha)) continue
      const candidates = exactCandidates.get(commit.sha) ?? []
      candidates.push(entry)
      exactCandidates.set(commit.sha, candidates)
    }
  }

  const assigned = new Set<string>()
  for (const repo of repos) {
    for (const commit of repo.commits) {
      const candidates = exactCandidates.get(commit.sha)
      if (!candidates || candidates.length === 0) continue
      const selected = [...candidates].sort((a, b) => {
        const aBefore = a.start <= commit.ts ? a.start : Number.NEGATIVE_INFINITY
        const bBefore = b.start <= commit.ts ? b.start : Number.NEGATIVE_INFINITY
        return bBefore - aBefore || a.start - b.start
      })[0]!
      addCommit(selected.row, commit)
      assigned.add(commit.sha)
    }
  }

  const unattributedCommits: UnattributedCommit[] = []
  for (const repo of repos) {
    for (const commit of repo.commits) {
      if (assigned.has(commit.sha)) continue
      const candidates = entries.filter((entry) => {
        if (entry.repo.path !== repo.path) return false
        // 有 commit_hash 的 session 已声明 exact 精度；即使 rev range 为空或无效，
        // 也不能静默降级成 heuristic，否则报告会掩盖精确关联失败。
        if (entry.row.confidence === 'exact') return false
        if (entry.branch !== null && entry.branch !== repo.branch) return false
        return commit.ts >= entry.start && commit.ts <= entry.end
      })
      if (candidates.length > 0) {
        const selected = [...candidates].sort((a, b) =>
          distanceToWindow(a, commit.ts) - distanceToWindow(b, commit.ts) ||
          a.end - a.start - (b.end - b.start),
        )[0]!
        addCommit(selected.row, commit)
        assigned.add(commit.sha)
      } else {
        unattributedCommits.push({ repo: repo.name, ...commit })
      }
    }
  }

  return {
    joined: [...rows.values()].map((row) => ({
      ...row,
      sessionIds: [...row.sessionIds].sort(),
      commitShas: [...row.commitShas].sort(),
    })),
    unattributed: {
      sessions: unattributedSessions.sort((a, b) => a.id.localeCompare(b.id)),
      commits: unattributedCommits.sort((a, b) => a.ts - b.ts || a.sha.localeCompare(b.sha)),
    },
  }
}

/** 为含 Codex 起始 commit 的 session 准备精确归属集合，然后执行 join。 */
export async function joinScannedData(
  repos: RepoDay[],
  sessions: JoinSession[],
  idleGapMs = 10 * 60_000,
): Promise<JoinResult> {
  const exactByFile = new Map<string, Set<string>>()
  const exactCache = new Map<string, Set<string>>()
  for (const item of sessions) {
    const baseSha = item.session.git?.commitHash
    if (!baseSha || item.session.isSidechain) continue
    const repo = repoForSession(repos, item.session.cwd)
    if (!repo) continue
    const cacheKey = `${repo.path}\u0000${baseSha}`
    let exact = exactCache.get(cacheKey)
    if (!exact) {
      exact = await commitsAfter(repo.path, baseSha)
      exactCache.set(cacheKey, exact)
    }
    exactByFile.set(item.session.file, exact)
  }
  return joinSessionsAndCommits(repos, sessions, exactByFile, idleGapMs)
}
