import type { GitCommit } from './types'

/**
 * 合并 cherry-pick / rebase 产生的副本。
 *
 * `--all` 会同时看到 feature 分支上的原件和 pick 到 dev 之后的副本：
 * 两者 hash 不同，但 author date、作者与标题都被 cherry-pick 原样保留。
 * 实测某日 4 条提交里有 2 对是这种副本，不合并会让「今天提交了几个」翻倍。
 *
 * 副本不丢弃，记入 copies，UI 可以展开看到它们落在哪些分支。
 */
export function dedupeCopies(commits: GitCommit[]): GitCommit[] {
  const groups = new Map<string, GitCommit[]>()
  const order: string[] = []
  for (const c of commits) {
    const key = `${c.repo} ${c.authorEmail} ${c.at} ${c.subject}`
    const g = groups.get(key)
    if (g) g.push(c)
    else { groups.set(key, [c]); order.push(key) }
  }

  return order.map((key) => {
    const g = groups.get(key)!
    // committer date 最早的是原件；相同则按 hash 稳定排序
    const sorted = [...g].sort((a, b) => a.committedAt - b.committedAt || a.hash.localeCompare(b.hash))
    const primary = sorted[0]!
    return { ...primary, copies: sorted.slice(1).map((c) => c.hash) }
  })
}
