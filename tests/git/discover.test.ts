import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverRepos, findRepoRoot } from '../../src/git/discover'

const root = mkdtempSync(join(tmpdir(), 'goule-git-'))
const repo = join(root, 'proj')
const nested = join(repo, 'src', 'deep')
mkdirSync(join(repo, '.git'), { recursive: true })
mkdirSync(nested, { recursive: true })

// worktree 的 .git 是文件而不是目录
const wt = join(root, 'wt')
mkdirSync(wt, { recursive: true })
writeFileSync(join(wt, '.git'), 'gitdir: /somewhere/.git/worktrees/wt\n')

const plain = join(root, 'plain')
mkdirSync(plain, { recursive: true })

afterAll(() => rmSync(root, { recursive: true, force: true }))

test('从子目录向上找到仓库根', () => {
  expect(findRepoRoot(nested)).toBe(repo)
})

test('仓库根自身也能识别', () => {
  expect(findRepoRoot(repo)).toBe(repo)
})

test('.git 是文件（worktree）也算仓库', () => {
  expect(findRepoRoot(wt)).toBe(wt)
})

test('非仓库目录返回 null', () => {
  expect(findRepoRoot(plain)).toBeNull()
})

test('不存在的路径返回 null，不抛异常', () => {
  expect(findRepoRoot(join(root, 'nope', 'deeper'))).toBeNull()
})

test('discoverRepos 去重并丢弃 null', () => {
  expect(discoverRepos([nested, repo, plain, null, wt]).sort()).toEqual([repo, wt].sort())
})

test('discoverRepos 空输入返回空数组', () => {
  expect(discoverRepos([])).toEqual([])
})
