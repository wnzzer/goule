import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test } from 'bun:test'
import { scanGit } from '../../src/git/scanner'
import { dayRange } from '../../src/types/day'

const dirs: string[] = []

function git(repo: string, args: string[], env?: Record<string, string>): string {
  const result = Bun.spawnSync(['git', '-C', repo, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  })
  const stdout = result.stdout ? new TextDecoder().decode(result.stdout) : ''
  const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : ''
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
  return stdout.trim()
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'goule-git-'))
  dirs.push(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'tester@example.com'])
  git(root, ['config', 'user.name', 'Tester'])
  return root
}

function commit(repo: string, file: string, content: string, subject: string, date: string): string {
  writeFileSync(join(repo, file), content)
  git(repo, ['add', file])
  git(repo, ['commit', '-m', subject], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  })
  return git(repo, ['rev-parse', 'HEAD'])
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('scanGit 递归发现仓库并提取 commit、统计和 Conventional Commit 分类', async () => {
  const root = mkdtempSync(join(tmpdir(), 'goule-git-root-'))
  dirs.push(root)
  const repo = join(root, 'project')
  // 根目录只是扫描根，仓库位于下一层，验证递归发现逻辑。
  mkdirSync(repo)
  git(repo, ['init', '-b', 'main'])
  git(repo, ['config', 'user.email', 'tester@example.com'])
  git(repo, ['config', 'user.name', 'Tester'])
  writeFileSync(join(repo, 'README.md'), 'base\n')
  git(repo, ['add', 'README.md'])
  git(repo, ['commit', '-m', 'chore: seed'], {
    GIT_AUTHOR_DATE: '2026-08-28T10:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-08-28T10:00:00+08:00',
  })

  const day = dayRange('2026-08-29', 4, 'Asia/Shanghai')
  const sha = commit(repo, 'src.ts', 'one\n', 'feat(parser): add metadata scan', '2026-08-29T09:00:00+08:00')
  const second = commit(repo, 'src.ts', 'one\ntwo\n', 'fix: correct range', '2026-08-29T10:00:00+08:00')
  const result = await scanGit([root], day, { author: 'auto', excludeMerge: true })

  expect(result.repos).toHaveLength(1)
  expect(result.repos[0]!.name).toBe(basename(repo))
  expect(result.repos[0]!.branch).toBe('main')
  expect(result.repos[0]!.commits.map((c) => c.sha)).toEqual([sha, second])
  expect(result.repos[0]!.commits[0]).toMatchObject({
    subject: 'feat(parser): add metadata scan',
    type: 'feat',
    scope: 'parser',
    files: 1,
    filesChanged: ['src.ts'],
    insertions: 1,
    deletions: 0,
    isMerge: false,
  })
  expect(result.totals).toMatchObject({ commits: 2, files: 2, insertions: 2, deletions: 0, repos: 1 })
})

test('scanGit 只统计目标逻辑日和当前用户 author', async () => {
  const repo = makeRepo()
  commit(repo, 'base.txt', 'base\n', 'chore: seed', '2026-08-28T10:00:00+08:00')
  const ours = commit(repo, 'ours.txt', 'ours\n', 'feat: ours', '2026-08-29T09:00:00+08:00')

  writeFileSync(join(repo, 'other.txt'), 'other\n')
  git(repo, ['add', 'other.txt'])
  git(repo, ['commit', '-m', 'feat: other author'], {
    GIT_AUTHOR_NAME: 'Other',
    GIT_AUTHOR_EMAIL: 'other@example.com',
    GIT_COMMITTER_NAME: 'Other',
    GIT_COMMITTER_EMAIL: 'other@example.com',
    GIT_AUTHOR_DATE: '2026-08-29T10:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-08-29T10:00:00+08:00',
  })

  const result = await scanGit([repo], dayRange('2026-08-29', 4, 'Asia/Shanghai'))
  expect(result.repos[0]!.commits.map((c) => c.sha)).toEqual([ours])
})

test('scanGit 可按配置排除 merge commit，同时保留 isMerge 标记', async () => {
  const repo = makeRepo()
  commit(repo, 'base.txt', 'base\n', 'chore: seed', '2026-08-28T10:00:00+08:00')
  git(repo, ['checkout', '-b', 'feature'])
  commit(repo, 'feature.txt', 'feature\n', 'feat: feature', '2026-08-29T09:00:00+08:00')
  git(repo, ['checkout', 'main'])
  commit(repo, 'main.txt', 'main\n', 'feat: main', '2026-08-29T10:00:00+08:00')
  git(repo, ['merge', '--no-ff', 'feature', '-m', 'Merge feature'], {
    GIT_AUTHOR_DATE: '2026-08-29T11:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-08-29T11:00:00+08:00',
  })

  const range = dayRange('2026-08-29', 4, 'Asia/Shanghai')
  const excluded = await scanGit([repo], range, { excludeMerge: true })
  expect(excluded.repos[0]!.commits).toHaveLength(2)

  const included = await scanGit([repo], range, { excludeMerge: false })
  expect(included.repos[0]!.commits).toHaveLength(3)
  expect(included.repos[0]!.commits.find((commit) => commit.subject === 'Merge feature')?.isMerge).toBe(true)
})
