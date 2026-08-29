import { expect, test } from 'bun:test'
import { dedupeCopies } from '../../src/git/dedupe'
import type { GitCommit } from '../../src/git/types'

const c = (over: Partial<GitCommit>): GitCommit => ({
  hash: 'h', shortHash: 'h', authorEmail: 'me@x.dev',
  at: 1_000_000, committedAt: 1_000_000, refs: [], subject: 's',
  insertions: 1, deletions: 0, files: 1,
  type: null, scope: null, breaking: false, description: 's',
  repo: '/r', repoName: 'r', copies: [],
  ...over,
})

test('同一提交被 cherry-pick：合并为一条，副本记在 copies', () => {
  const out = dedupeCopies([
    c({ hash: 'orig', committedAt: 100 }),
    c({ hash: 'picked', committedAt: 900 }),
  ])
  expect(out).toHaveLength(1)
  expect(out[0]!.hash).toBe('orig')
  expect(out[0]!.copies).toEqual(['picked'])
})

test('保留 committer date 最早的那条作为原件', () => {
  const out = dedupeCopies([
    c({ hash: 'picked', committedAt: 900 }),
    c({ hash: 'orig', committedAt: 100 }),
  ])
  expect(out[0]!.hash).toBe('orig')
  expect(out[0]!.copies).toEqual(['picked'])
})

test('author date 不同则不是副本', () => {
  const out = dedupeCopies([c({ hash: 'a', at: 1 }), c({ hash: 'b', at: 2 })])
  expect(out).toHaveLength(2)
})

test('subject 不同则不是副本', () => {
  const out = dedupeCopies([c({ hash: 'a' }), c({ hash: 'b', subject: '别的' })])
  expect(out).toHaveLength(2)
})

test('不同作者不是副本', () => {
  const out = dedupeCopies([c({ hash: 'a' }), c({ hash: 'b', authorEmail: 'other@x.dev' })])
  expect(out).toHaveLength(2)
})

test('跨仓库同名提交不合并', () => {
  const out = dedupeCopies([c({ hash: 'a' }), c({ hash: 'b', repo: '/other' })])
  expect(out).toHaveLength(2)
})

test('三份副本只留一条，另两条都记下来', () => {
  const out = dedupeCopies([
    c({ hash: 'a', committedAt: 300 }),
    c({ hash: 'b', committedAt: 100 }),
    c({ hash: 'c', committedAt: 200 }),
  ])
  expect(out).toHaveLength(1)
  expect(out[0]!.hash).toBe('b')
  expect(out[0]!.copies.sort()).toEqual(['a', 'c'])
})

test('空输入返回空数组', () => {
  expect(dedupeCopies([])).toEqual([])
})
