import { basename } from 'node:path'
import type { DayRange } from '../types/day'
import { parseConventional } from './conventional'
import { dedupeCopies } from './dedupe'
import { parseLogOutput, PRETTY_FORMAT } from './parse'
import type { GitCommit, GitRepoFacts } from './types'

export interface GitResult { ok: boolean; stdout: string; stderr: string }

/** git log 的窗口两侧各放宽 2 天，再在 JS 里按 author date 精确过滤。 */
const WINDOW_MARGIN_MS = 2 * 86_400_000

/** 单次 git 调用的超时，避免个别仓库（网络文件系统、巨型 history）卡住整次扫描 */
const TIMEOUT_MS = 10_000

export async function runGit(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<GitResult> {
  try {
    const proc = Bun.spawn(['git', ...args], {
      cwd,
      env: { ...process.env, ...env, GIT_OPTIONAL_LOCKS: '0' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS)
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    clearTimeout(timer)
    return { ok: code === 0, stdout, stderr: stderr.trim() }
  } catch (e) {
    return { ok: false, stdout: '', stderr: (e as Error).message }
  }
}

export interface RepoScanOptions {
  /** 为空则回退到仓库自己的 user.email；仍为空则不按作者过滤 */
  authorEmails?: string[]
}

async function currentBranch(repo: string): Promise<string | null> {
  const r = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repo)
  if (!r.ok) return null
  const b = r.stdout.trim()
  // detached HEAD 时 git 回显字面量 "HEAD"，不是分支名
  return b && b !== 'HEAD' ? b : null
}

async function resolveAuthors(repo: string, opts: RepoScanOptions): Promise<string[]> {
  if (opts.authorEmails?.length) return opts.authorEmails
  const r = await runGit(['config', '--get', 'user.email'], repo)
  const email = r.ok ? r.stdout.trim() : ''
  return email ? [email] : []
}

/**
 * 读取一个仓库在该逻辑日内、由「我」提交的记录。
 *
 * 用 author date 而不是 commit date：rebase / amend 会重写 commit date，
 * 把几天前写的代码算到今天。--since/--until 走的是 commit date，
 * 因此只用来粗筛，精确过滤在 JS 里按 %aI 做。
 */
export async function readRepoFacts(
  repo: string,
  range: DayRange,
  opts: RepoScanOptions = {},
): Promise<GitRepoFacts> {
  const name = basename(repo)
  const base: GitRepoFacts = {
    path: repo, name, branch: null, authorEmails: [], commits: [], error: null,
  }

  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], repo)
  if (!inside.ok) {
    return { ...base, error: inside.stderr || '不是 git 仓库' }
  }

  const [branch, authorEmails] = await Promise.all([
    currentBranch(repo),
    resolveAuthors(repo, opts),
  ])

  const since = new Date(range.start - WINDOW_MARGIN_MS).toISOString()
  const until = new Date(range.end + WINDOW_MARGIN_MS).toISOString()
  const log = await runGit([
    'log', '--all', '--numstat', `--pretty=format:${PRETTY_FORMAT}`,
    `--since=${since}`, `--until=${until}`,
  ], repo)

  if (!log.ok) return { ...base, branch, authorEmails, error: log.stderr || 'git log 失败' }

  const allow = new Set(authorEmails)
  const seen = new Set<string>()
  const commits: GitCommit[] = []
  for (const c of parseLogOutput(log.stdout)) {
    if (c.at < range.start || c.at >= range.end) continue
    if (allow.size > 0 && !allow.has(c.authorEmail)) continue
    if (seen.has(c.hash)) continue // --all 会让同一提交在多个 ref 下重复出现
    seen.add(c.hash)
    commits.push({ ...c, ...parseConventional(c.subject), repo, repoName: name, copies: [] })
  }
  const merged = dedupeCopies(commits).sort((a, b) => a.at - b.at)

  return { path: repo, name, branch, authorEmails, commits: merged, error: null }
}
