import type { Instant } from '../types/instant'

/** Conventional Commit 前缀解析结果。无法可靠解析时保留 null。 */
export interface GitCommit {
  sha: string
  /** author date：提交被写出来的时刻，归属逻辑日用它 */
  ts: Instant
  /** committer date：rebase / amend 会重写，只用于在副本里认出原件 */
  committerTs?: Instant
  /** 同一逻辑提交被 cherry-pick 出的其它 sha，不静默丢弃 */
  copies?: string[]
  subject: string
  type: string | null
  scope: string | null
  files: number
  insertions: number
  deletions: number
  isMerge: boolean
}

export interface RepoDay {
  path: string
  name: string
  branch: string
  commits: GitCommit[]
}

export interface GitTotals {
  commits: number
  files: number
  insertions: number
  deletions: number
  repos: number
}

export interface GitScanResult {
  repos: RepoDay[]
  totals: GitTotals
}
