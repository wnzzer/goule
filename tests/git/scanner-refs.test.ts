import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanGit } from '../../src/git/scanner'
import { dayRange } from '../../src/types/day'

const repo = mkdtempSync(join(tmpdir(), 'goule-refs-'))
const range = dayRange('2026-08-28', 4, 'Asia/Shanghai')
const EMAIL = 'me@x.dev'

async function git(args: string[], env?: Record<string, string>) {
  const p = Bun.spawn(['git', '-C', repo, ...args], {
    env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe',
  })
  await p.exited
}
async function commit(file: string, body: string, subject: string, authorIso: string, committerIso = authorIso) {
  writeFileSync(join(repo, file), body)
  await git(['add', '-A'])
  await git(['-c', 'user.name=T', '-c', `user.email=${EMAIL}`, 'commit', '-m', subject],
    { GIT_AUTHOR_DATE: authorIso, GIT_COMMITTER_DATE: committerIso })
}

beforeAll(async () => {
  await git(['init', '-b', 'master'])
  await git(['config', 'user.email', EMAIL])
  await git(['config', 'user.name', 'Me'])
  await commit('base.txt', 'base\n', 'chore: base', '2026-08-27T10:00:00+08:00')

  // 在 feature 分支上提交，然后切回 master —— 提交从 HEAD 不可达
  await git(['checkout', '-q', '-b', 'feature/x'])
  await commit('a.txt', 'one\n', 'feat: 在 feature 分支上干的活', '2026-08-28T11:00:00+08:00')
  await git(['checkout', '-q', 'master'])

  // author date 在当日、committer date 在次日：rebase / amend 的典型形态
  await commit('b.txt', 'two\n', 'fix: 昨天写的今天才 rebase',
    '2026-08-28T15:00:00+08:00', '2026-08-30T09:00:00+08:00')
})
afterAll(() => rmSync(repo, { recursive: true, force: true }))

test('feature 分支上的提交不能因为 HEAD 不可达就丢掉', async () => {
  const r = await scanGit([repo], range, { author: EMAIL, excludeMerge: true })
  const subjects = r.repos.flatMap((x) => x.commits.map((c) => c.subject))
  expect(subjects).toContain('feat: 在 feature 分支上干的活')
})

test('按 author date 归属：committer date 落在次日也算今天', async () => {
  const r = await scanGit([repo], range, { author: EMAIL, excludeMerge: true })
  const subjects = r.repos.flatMap((x) => x.commits.map((c) => c.subject))
  expect(subjects).toContain('fix: 昨天写的今天才 rebase')
})

test('逻辑日之外的提交仍然排除', async () => {
  const r = await scanGit([repo], range, { author: EMAIL, excludeMerge: true })
  const subjects = r.repos.flatMap((x) => x.commits.map((c) => c.subject))
  expect(subjects).not.toContain('chore: base')
})

test('totals 与实际提交数一致', async () => {
  const r = await scanGit([repo], range, { author: EMAIL, excludeMerge: true })
  const n = r.repos.reduce((t, x) => t + x.commits.length, 0)
  expect(r.totals.commits).toBe(n)
  expect(n).toBe(2)
})
