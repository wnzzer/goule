import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readRepoFacts, runGit } from '../../src/git/log'
import { dayRange } from '../../src/types/day'

const repo = mkdtempSync(join(tmpdir(), 'goule-repo-'))
const TZ = 'Asia/Shanghai'
// 逻辑日 2026-08-28 04:00 → 2026-08-29 04:00（+08:00）
const range = dayRange('2026-08-28', 4, TZ)

async function commit(file: string, body: string, subject: string, iso: string, email: string) {
  writeFileSync(join(repo, file), body)
  await runGit(['add', '-A'], repo)
  await runGit([
    '-c', `user.name=T`, '-c', `user.email=${email}`,
    'commit', '-m', subject, '--date', iso,
  ], repo, { GIT_COMMITTER_DATE: iso, GIT_AUTHOR_DATE: iso })
}

beforeAll(async () => {
  await runGit(['init', '-b', 'main'], repo)
  await runGit(['config', 'user.email', 'me@x.dev'], repo)
  await runGit(['config', 'user.name', 'Me'], repo)
  await commit('a.txt', 'one\ntwo\n', 'feat(scan): 加入扫描', '2026-08-28T10:00:00+08:00', 'me@x.dev')
  await commit('a.txt', 'one\ntwo\nthree\n', 'fix: 修边界', '2026-08-28T15:30:00+08:00', 'me@x.dev')
  await commit('b.txt', 'x\n', '别人的提交', '2026-08-28T16:00:00+08:00', 'other@x.dev')
  // 逻辑日之外：2026-08-28 02:00 属于前一个逻辑日
  await commit('c.txt', 'y\n', 'chore: 昨夜', '2026-08-28T02:00:00+08:00', 'me@x.dev')
})

afterAll(() => rmSync(repo, { recursive: true, force: true }))

test('只返回逻辑日范围内、指定作者的提交', async () => {
  const f = await readRepoFacts(repo, range, { authorEmails: ['me@x.dev'] })
  expect(f.error).toBeNull()
  expect(f.commits.map((c) => c.subject)).toEqual(['feat(scan): 加入扫描', 'fix: 修边界'])
})

test('按 author date 排序，最早在前', async () => {
  const f = await readRepoFacts(repo, range, { authorEmails: ['me@x.dev'] })
  expect(f.commits[0]!.at).toBeLessThan(f.commits[1]!.at)
})

test('解析 Conventional Commits 类型与 scope', async () => {
  const f = await readRepoFacts(repo, range, { authorEmails: ['me@x.dev'] })
  expect(f.commits[0]).toMatchObject({ type: 'feat', scope: 'scan' })
  expect(f.commits[1]).toMatchObject({ type: 'fix', scope: null })
})

test('统计增删行数', async () => {
  const f = await readRepoFacts(repo, range, { authorEmails: ['me@x.dev'] })
  expect(f.commits[0]!.insertions).toBe(2)
  expect(f.commits[1]!.insertions).toBe(1)
  expect(f.commits[1]!.deletions).toBe(0)
})

test('不传作者时回退到仓库 user.email', async () => {
  const f = await readRepoFacts(repo, range, {})
  expect(f.authorEmails).toEqual(['me@x.dev'])
  expect(f.commits.map((c) => c.subject)).not.toContain('别人的提交')
})

test('带上仓库名与当前分支', async () => {
  const f = await readRepoFacts(repo, range, {})
  expect(f.branch).toBe('main')
  expect(f.commits[0]!.repo).toBe(repo)
  expect(f.commits[0]!.repoName).toBe(f.name)
})

test('非仓库目录返回 error 而不是抛异常', async () => {
  const plain = mkdtempSync(join(tmpdir(), 'goule-plain-'))
  const f = await readRepoFacts(plain, range, {})
  expect(f.error).not.toBeNull()
  expect(f.commits).toEqual([])
  rmSync(plain, { recursive: true, force: true })
})
