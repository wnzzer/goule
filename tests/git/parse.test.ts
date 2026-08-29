import { expect, test } from 'bun:test'
import { parseLogOutput } from '../../src/git/parse'

const RS = '\x1e'
const US = '\x1f'
const rec = (
  h: string, at: string, email: string, refs: string, subject: string,
  stats = '', committed = at,
) => `${RS}${h}${US}${at}${US}${committed}${US}${email}${US}${refs}${US}${subject}\n${stats}`

test('解析单条提交与 numstat', () => {
  const out = rec('abc123def456', '2026-08-28T10:00:00+08:00', 'me@x.dev', 'HEAD -> main',
    'feat: 加入时间轴', '10\t2\tsrc/a.ts\n3\t0\tsrc/b.ts\n')
  const commits = parseLogOutput(out)
  expect(commits).toHaveLength(1)
  expect(commits[0]).toMatchObject({
    hash: 'abc123def456',
    shortHash: 'abc123d',
    authorEmail: 'me@x.dev',
    subject: 'feat: 加入时间轴',
    insertions: 13,
    deletions: 2,
    files: 2,
  })
  expect(commits[0]!.refs).toEqual(['HEAD -> main'])
})

test('二进制文件的 -\\t- 不计入增删，但计入文件数', () => {
  const out = rec('a'.repeat(40), '2026-08-28T10:00:00+08:00', 'me@x.dev', '',
    'chore: 加图', '-\t-\tdocs/a.png\n5\t1\tdocs/a.md\n')
  const c = parseLogOutput(out)[0]!
  expect(c.insertions).toBe(5)
  expect(c.deletions).toBe(1)
  expect(c.files).toBe(2)
})

test('多条提交按输出顺序解析', () => {
  const out =
    rec('h1'.padEnd(40, '0'), '2026-08-28T10:00:00+08:00', 'a@x.dev', '', 'fix: 一', '1\t1\tf\n') +
    rec('h2'.padEnd(40, '0'), '2026-08-28T11:00:00+08:00', 'b@x.dev', '', 'feat: 二', '2\t0\tg\n')
  const commits = parseLogOutput(out)
  expect(commits.map((c) => c.subject)).toEqual(['fix: 一', 'feat: 二'])
  expect(commits.map((c) => c.authorEmail)).toEqual(['a@x.dev', 'b@x.dev'])
})

test('无文件变更的提交（如空提交/合并）增删为 0', () => {
  const out = rec('h'.repeat(40), '2026-08-28T10:00:00+08:00', 'me@x.dev', '', 'Merge branch x')
  const c = parseLogOutput(out)[0]!
  expect(c.insertions).toBe(0)
  expect(c.files).toBe(0)
})

test('committer date 单独解析，缺失时回落到 author date', () => {
  const withC = parseLogOutput(rec('h'.repeat(40), '2026-08-28T10:00:00+08:00', 'me@x.dev', '',
    'fix: x', '1\t0\tf\n', '2026-08-28T12:00:00+08:00'))[0]!
  expect(withC.committedAt).toBeGreaterThan(withC.at)

  const noC = parseLogOutput(
    `${RS}${'h'.repeat(40)}${US}2026-08-28T10:00:00+08:00${US}${US}me@x.dev${US}${US}fix: x\n`)[0]!
  expect(noC.committedAt).toBe(noC.at)
})

test('空输出返回空数组', () => {
  expect(parseLogOutput('')).toEqual([])
  expect(parseLogOutput('\n')).toEqual([])
})

test('subject 含分隔符不会截断后续字段', () => {
  const out = rec('h'.repeat(40), '2026-08-28T10:00:00+08:00', 'me@x.dev', '', 'fix: a: b: c', '1\t0\tf\n')
  expect(parseLogOutput(out)[0]!.subject).toBe('fix: a: b: c')
})
