import type { Instant } from '../types/instant'

/** Conventional Commits 规范类型。非规范提交为 null，不猜、不归类。 */
export type CommitType =
  | 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'perf'
  | 'test' | 'build' | 'ci' | 'chore' | 'revert'

export const COMMIT_TYPES: readonly CommitType[] = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf',
  'test', 'build', 'ci', 'chore', 'revert',
] as const

export interface ConventionalParts {
  type: CommitType | null
  scope: string | null
  breaking: boolean
  description: string
}

/** git log 一条记录的原始解析结果，尚未按逻辑日过滤。 */
export interface RawCommit {
  hash: string
  shortHash: string
  authorEmail: string
  /** author date，不是 commit date：rebase / amend 会改后者 */
  at: Instant
  /** committer date：同一提交被 cherry-pick 后，它才是区分副本的依据 */
  committedAt: Instant
  refs: string[]
  subject: string
  insertions: number
  deletions: number
  files: number
}

export interface GitCommit extends RawCommit, ConventionalParts {
  repo: string
  repoName: string
  /** 同一逻辑提交的其它副本（cherry-pick / rebase 产生），不静默丢弃 */
  copies: string[]
}

export interface GitRepoFacts {
  path: string
  name: string
  /** 扫描时的 HEAD 分支；detached HEAD 为 null */
  branch: string | null
  /** 该仓库用于筛选「我的提交」的邮箱 */
  authorEmails: string[]
  commits: GitCommit[]
  /** 仓库不可读或 git 调用失败时的原因，成功为 null */
  error: string | null
}

export interface GitFacts {
  enabled: boolean
  repos: GitRepoFacts[]
  commits: GitCommit[]
  insertions: number
  deletions: number
}
