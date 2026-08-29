import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test } from 'bun:test'
import { scanDay } from '../../src/scan'
import { DEFAULT_CONFIG } from '../../src/types/config'

const dirs: string[] = []

function git(repo: string, args: string[], env?: Record<string, string>): void {
  const result = Bun.spawnSync(['git', '-C', repo, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  })
  if (result.exitCode !== 0) {
    const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : ''
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('scanDay 把 Git 总结和孤儿 commit 接入扫描结果', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'goule-git-integration-'))
  dirs.push(repo)
  git(repo, ['init', '-b', 'main'])
  git(repo, ['config', 'user.email', 'tester@example.com'])
  git(repo, ['config', 'user.name', 'Tester'])
  writeFileSync(join(repo, 'README.md'), 'summary\n')
  git(repo, ['add', 'README.md'])
  git(repo, ['commit', '-m', 'feat: add git summary'], {
    GIT_AUTHOR_DATE: '2026-08-29T09:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-08-29T09:00:00+08:00',
  })

  const cfg = {
    ...DEFAULT_CONFIG,
    sources: {
      claudeCode: { enabled: false, root: '/does/not/exist' },
      codex: { enabled: false, root: '/does/not/exist' },
    },
    timezone: 'Asia/Shanghai',
    git: { repos: [repo], author: 'auto' as const, excludeMerge: true },
  }
  const facts = await scanDay('2026-08-29', cfg)

  expect(facts.git.totals).toMatchObject({ commits: 1, files: 1, insertions: 1, deletions: 0, repos: 1 })
  expect(facts.git.repos[0]!.commits[0]!.subject).toBe('feat: add git summary')
  expect(facts.joined).toEqual([])
  expect(facts.unattributed.commits.map((commit) => commit.subject)).toEqual(['feat: add git summary'])
})
