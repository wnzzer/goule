import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { DayRange } from '../types/day'
import type { GitCommit, GitScanResult, RepoDay } from './types'

interface GitCommandResult {
  code: number
  stdout: string
  stderr: string
}

function expandHome(path: string): string {
  if (path === '~') return process.env.HOME ?? path
  if (path.startsWith('~/')) return join(process.env.HOME ?? '~', path.slice(2))
  return path
}

async function runGit(repoPath: string, args: string[]): Promise<GitCommandResult> {
  const proc = Bun.spawn(['git', '-C', repoPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code: await proc.exited, stdout, stderr }
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { return false }
}

function isGitMarker(path: string): boolean {
  try { return lstatSync(path).isDirectory() || lstatSync(path).isFile() } catch { return false }
}

/**
 * 递归发现配置根下的 Git 工作树。跳过 .git 内容、依赖目录和隐藏目录，
 * 避免把 Git 对象文件或 node_modules 当成仓库继续遍历。
 */
export function discoverRepositories(roots: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const skipped = new Set(['.git', 'node_modules', 'vendor', 'target', 'dist', 'build'])

  const add = (path: string) => {
    let canonical: string
    try { canonical = realpathSync(path) } catch { canonical = resolve(path) }
    if (!seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }

  const walk = (rawPath: string): void => {
    const path = resolve(expandHome(rawPath))
    if (!isDirectory(path)) return

    if (isGitMarker(join(path, '.git'))) {
      add(path)
      return
    }

    let entries
    try { entries = readdirSync(path, { withFileTypes: true, encoding: 'utf8' }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      if (entry.name === '.git' || skipped.has(entry.name) || entry.name.startsWith('.')) continue
      walk(join(path, entry.name))
    }
  }

  for (const root of roots) {
    const expanded = resolve(expandHome(root))
    if (basename(expanded) === '.git' && isGitMarker(expanded)) walk(dirname(expanded))
    else walk(expanded)
  }
  return out.sort()
}

function parseConventionalSubject(subject: string): { type: string | null; scope: string | null } {
  const match = /^([A-Za-z][\w-]*)(?:\(([^)]+)\))?!?:\s+.+$/.exec(subject)
  return { type: match?.[1] ?? null, scope: match?.[2] ?? null }
}

function parseNumstat(lines: string[]): Pick<GitCommit, 'files' | 'insertions' | 'deletions'> {
  let files = 0
  let insertions = 0
  let deletions = 0
  for (const line of lines) {
    const match = /^(\d+|-)[\t ]+(\d+|-)[\t ]+/.exec(line)
    if (!match) continue
    files++
    if (match[1] !== '-') insertions += Number(match[1])
    if (match[2] !== '-') deletions += Number(match[2])
  }
  return { files, insertions, deletions }
}

/**
 * 合并 cherry-pick / rebase 产生的副本。
 *
 * 扫 --all 会同时看到 feature 分支上的原件和 pick 到 dev 之后的副本：
 * hash 不同，但 author date 与标题被 cherry-pick 原样保留。实测某日 4 条
 * 提交里有 2 对是这种副本，不合并会让「今天提交了几个」翻倍。
 * 副本不丢弃，记入 copies。
 */
function mergeCopies(commits: GitCommit[]): GitCommit[] {
  const groups = new Map<string, GitCommit[]>()
  const order: string[] = []
  for (const c of commits) {
    const key = `${c.ts}\u0000${c.subject}`
    const g = groups.get(key)
    if (g) g.push(c)
    else { groups.set(key, [c]); order.push(key) }
  }
  return order.map((key) => {
    const g = groups.get(key)!
    // committerTs 最早的是原件；相同则按 sha 稳定排序
    const sorted = [...g].sort((a, b) =>
      (a.committerTs ?? a.ts) - (b.committerTs ?? b.ts) || a.sha.localeCompare(b.sha))
    const primary = sorted[0]!
    const copies = sorted.slice(1).map((c) => c.sha)
    return copies.length ? { ...primary, copies } : primary
  })
}

function parseLog(stdout: string, range: DayRange): GitCommit[] {
  const commits: GitCommit[] = []
  const seen = new Set<string>()
  for (const raw of stdout.split('\x1e')) {
    const record = raw.replace(/^\n+/, '')
    if (!record.trim()) continue
    const lines = record.split('\n')
    const header = lines.shift() ?? ''
    const [sha, authorRaw, committerRaw, subjectRaw, parentsRaw] = header.split('\x1f')
    if (!sha || !authorRaw || subjectRaw === undefined) continue
    // 按 author date 归属：rebase / amend 会重写 committer date，
    // 用后者会把几天前写的代码算到今天。
    const ts = Date.parse(authorRaw)
    if (!Number.isFinite(ts) || ts < range.start || ts >= range.end) continue
    if (seen.has(sha)) continue // --all 让同一提交在多个 ref 下重复出现
    seen.add(sha)

    const committerTs = Date.parse(committerRaw ?? '')
    const parents = (parentsRaw ?? '').trim().split(/\s+/).filter(Boolean)
    const subject = subjectRaw.trim()
    const stats = parseNumstat(lines)
    const conventional = parseConventionalSubject(subject)
    commits.push({
      sha,
      ts,
      committerTs: Number.isFinite(committerTs) ? committerTs : ts,
      subject,
      type: conventional.type,
      scope: conventional.scope,
      ...stats,
      isMerge: parents.length > 1,
    })
  }
  return mergeCopies(commits).sort((a, b) => a.ts - b.ts || a.sha.localeCompare(b.sha))
}

async function repoBranch(repoPath: string): Promise<string> {
  const branch = await runGit(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (branch.code === 0 && branch.stdout.trim()) return branch.stdout.trim()
  return 'HEAD'
}

async function repoAuthor(repoPath: string, author: 'auto' | string): Promise<string | null> {
  if (author !== 'auto') return author || null
  const result = await runGit(repoPath, ['config', '--get', 'user.email'])
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : null
}

function escapeGitAuthor(value: string): string {
  // git log 的 --author 使用正则；邮箱中的 +、. 等字符应按字面匹配。
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function scanRepository(
  repoPath: string,
  range: DayRange,
  options: { author: 'auto' | string; excludeMerge: boolean },
): Promise<RepoDay | null> {
  const branch = await repoBranch(repoPath)
  const author = await repoAuthor(repoPath, options.author)
  // --all：只看 HEAD 可达会漏掉「在 feature 分支上干完就切回 master」的提交，
  //   实测某日 2 个提交全在别的分支上，HEAD 视角扫出 0 条。
  // 窗口两侧各放宽 14 天：--since/--until 走的是 committer date，而归属按
  //   author date，rebase 会让两者相差数日；精确过滤在 parseLog 里做。
  const margin = 14 * 86_400_000
  const args = [
    'log', '--all', '--no-color', '--no-renames', '--root',
    `--since=${new Date(range.start - margin).toISOString()}`,
    `--until=${new Date(range.end + margin).toISOString()}`,
    '--format=%x1e%H%x1f%aI%x1f%cI%x1f%s%x1f%P', '--numstat',
  ]
  if (author) args.push(`--author=${escapeGitAuthor(author)}`)
  if (options.excludeMerge) args.push('--no-merges')

  const result = await runGit(repoPath, args)
  if (result.code !== 0) return null
  return {
    path: repoPath,
    name: basename(repoPath),
    branch,
    commits: parseLog(result.stdout, range),
  }
}

export async function scanGit(
  roots: string[],
  range: DayRange,
  options: { author?: 'auto' | string; excludeMerge?: boolean } = {},
): Promise<GitScanResult> {
  const scanned = await Promise.all(
    discoverRepositories(roots).map((repoPath) => scanRepository(repoPath, range, {
      author: options.author ?? 'auto',
      excludeMerge: options.excludeMerge ?? true,
    })),
  )
  const repos = scanned.filter((repo): repo is RepoDay => repo !== null)

  const totals = repos.reduce(
    (sum, repo) => {
      for (const commit of repo.commits) {
        sum.commits++
        sum.files += commit.files
        sum.insertions += commit.insertions
        sum.deletions += commit.deletions
      }
      sum.repos++
      return sum
    },
    { commits: 0, files: 0, insertions: 0, deletions: 0, repos: 0 },
  )
  return { repos, totals }
}

/** Codex 的 session_meta.commit_hash..HEAD 精确归属所需的 commit 集合。 */
export async function commitsAfter(repoPath: string, baseSha: string): Promise<Set<string>> {
  const result = await runGit(repoPath, ['rev-list', `${baseSha}..HEAD`])
  if (result.code !== 0) return new Set()
  return new Set(result.stdout.split(/\r?\n/).map((sha) => sha.trim()).filter(Boolean))
}

export function isWithinRepo(repoPath: string, cwd: string | null): boolean {
  if (!cwd) return false
  const canonical = (path: string): string => {
    try { return realpathSync(path) } catch { return resolve(path) }
  }
  const repo = canonical(repoPath)
  const candidate = canonical(cwd)
  const rel = relative(repo, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(sep))
}
