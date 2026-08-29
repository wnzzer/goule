import type { Instant } from '../types/instant'

/** Conventional Commit 前缀解析结果。无法可靠解析时保留 null。 */
export interface GitCommit {
  sha: string
  ts: Instant
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
