import type { DayRange } from '../types/day'
import { discoverRepos } from './discover'
import { readRepoFacts } from './log'
import type { GitCommit, GitFacts, GitRepoFacts } from './types'

export interface GitScanConfig {
  enabled: boolean
  /** session cwd 之外额外扫描的仓库根 */
  extraRepos: string[]
  /** 为空则每个仓库回退到自己的 user.email */
  authorEmails: string[]
}

/** 并发上限：仓库通常个位数，限流只为避免异常场景下同时拉起几十个 git 进程 */
const CONCURRENCY = 8

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

export function emptyGitFacts(enabled = false): GitFacts {
  return { enabled, repos: [], commits: [], insertions: 0, deletions: 0 }
}

/**
 * 从 session 的 cwd 反推仓库并读取当日提交。
 *
 * 仓库来源是 session，不是全盘扫描：Goule 只看你今天实际工作过的目录，
 * 不去遍历磁盘上所有 git 仓库。
 */
export async function scanGit(
  cwds: Array<string | null>,
  range: DayRange,
  cfg: GitScanConfig,
): Promise<GitFacts> {
  if (!cfg.enabled) return emptyGitFacts(false)

  const roots = discoverRepos([...cwds, ...cfg.extraRepos])
  const repos: GitRepoFacts[] = await mapLimit(roots, CONCURRENCY, (repo) =>
    readRepoFacts(repo, range, { authorEmails: cfg.authorEmails }))

  repos.sort((a, b) => b.commits.length - a.commits.length || a.name.localeCompare(b.name))

  const commits: GitCommit[] = repos.flatMap((r) => r.commits).sort((a, b) => a.at - b.at)
  return {
    enabled: true,
    repos,
    commits,
    insertions: commits.reduce((t, c) => t + c.insertions, 0),
    deletions: commits.reduce((t, c) => t + c.deletions, 0),
  }
}
