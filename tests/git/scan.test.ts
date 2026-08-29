import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyGitFacts, scanGit } from '../../src/git'
import { runGit } from '../../src/git/log'
import { dayRange } from '../../src/types/day'

const range = dayRange('2026-08-28', 4, 'Asia/Shanghai')
const repoA = mkdtempSync(join(tmpdir(), 'goule-a-'))
const repoB = mkdtempSync(join(tmpdir(), 'goule-b-'))
const cfg = { enabled: true, extraRepos: [], authorEmails: ['me@x.dev'] }

async function seed(repo: string, subject: string, iso: string) {
  await runGit(['init', '-b', 'main'], repo)
  writeFileSync(join(repo, 'f.txt'), subject)
  await runGit(['add', '-A'], repo)
  await runGit(
    ['-c', 'user.name=T', '-c', 'user.email=me@x.dev', 'commit', '-m', subject],
    repo, { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
  )
}

beforeAll(async () => {
  await seed(repoA, 'feat: A 的提交', '2026-08-28T11:00:00+08:00')
  await seed(repoB, 'fix: B 的提交', '2026-08-28T09:00:00+08:00')
})
afterAll(() => {
  rmSync(repoA, { recursive: true, force: true })
  rmSync(repoB, { recursive: true, force: true })
})

test('从 cwd 反推多个仓库并合并提交，按时间排序', async () => {
  const f = await scanGit([join(repoA, 'sub', 'deep'), repoB], range, cfg)
  expect(f.enabled).toBe(true)
  expect(f.repos).toHaveLength(2)
  expect(f.commits.map((c) => c.subject)).toEqual(['fix: B 的提交', 'feat: A 的提交'])
})

test('同一仓库的多个 cwd 只扫一次', async () => {
  const f = await scanGit([repoA, join(repoA, 'x'), join(repoA, 'y', 'z')], range, cfg)
  expect(f.repos).toHaveLength(1)
})

test('汇总增删行数', async () => {
  const f = await scanGit([repoA, repoB], range, cfg)
  expect(f.insertions).toBe(2)
  expect(f.deletions).toBe(0)
})

test('关闭时不跑 git，返回空结构', async () => {
  const f = await scanGit([repoA], range, { ...cfg, enabled: false })
  expect(f).toEqual(emptyGitFacts(false))
})

test('cwd 全为 null 时安全返回', async () => {
  const f = await scanGit([null, null], range, cfg)
  expect(f.repos).toEqual([])
  expect(f.commits).toEqual([])
})

test('extraRepos 会被一并扫描', async () => {
  const f = await scanGit([], range, { ...cfg, extraRepos: [repoB] })
  expect(f.repos.map((r) => r.path)).toEqual([repoB])
})
