import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test } from 'bun:test'
import { joinScannedData, joinSessionsAndCommits, type JoinSession } from '../../src/git/join'
import { scanGit } from '../../src/git/scanner'
import type { RepoDay } from '../../src/git/types'
import type { RawSession } from '../../src/types/session'
import { dayRange } from '../../src/types/day'

const tempDirs: string[] = []

const repo: RepoDay = {
  path: '/tmp/goule-repo',
  name: 'goule-repo',
  branch: 'main',
  commits: [
    {
      sha: 'exact-1', ts: Date.parse('2026-08-29T09:30:00Z'), subject: 'feat: exact',
      type: 'feat', scope: null, files: 1, insertions: 2, deletions: 0, isMerge: false,
    },
    {
      sha: 'heuristic-1', ts: Date.parse('2026-08-29T14:30:00Z'), subject: 'fix: heuristic',
      type: 'fix', scope: null, files: 1, insertions: 1, deletions: 1, isMerge: false,
    },
    {
      sha: 'orphan-1', ts: Date.parse('2026-08-29T20:00:00Z'), subject: 'docs: orphan',
      type: 'docs', scope: null, files: 1, insertions: 1, deletions: 0, isMerge: false,
    },
  ],
}

function session(overrides: Partial<RawSession>): RawSession {
  return {
    id: 'session',
    tool: 'codex',
    file: '/tmp/session.jsonl',
    tokenEvents: [],
    events: [
      { at: Date.parse('2026-08-29T09:00:00Z'), kind: 'human' },
      { at: Date.parse('2026-08-29T10:00:00Z'), kind: 'agent' },
    ],
    cwd: '/tmp/goule-repo',
    git: { branch: 'main', commitHash: null, remoteUrl: null },
    title: null,
    isSidechain: false,
    parentSessionId: null,
    ...overrides,
  }
}

test('joinSessionsAndCommits 支持 exact、heuristic 和孤儿桶', () => {
  const exact: JoinSession = {
    session: session({
      id: 'exact-session',
      file: '/tmp/exact.jsonl',
      git: { branch: 'main', commitHash: 'base-sha', remoteUrl: null },
    }),
    minutes: 60,
  }
  const heuristic: JoinSession = {
    session: session({
      id: 'heuristic-session',
      file: '/tmp/heuristic.jsonl',
      events: [
        { at: Date.parse('2026-08-29T14:00:00Z'), kind: 'human' },
        { at: Date.parse('2026-08-29T15:00:00Z'), kind: 'agent' },
      ],
      git: { branch: 'main', commitHash: null, remoteUrl: null },
    }),
    minutes: 30,
  }
  const outside: JoinSession = {
    session: session({ id: 'outside-session', cwd: '/tmp/other-repo', file: '/tmp/outside.jsonl' }),
    minutes: 10,
  }

  const result = joinSessionsAndCommits(
    [repo],
    [exact, heuristic, outside],
    new Map([['/tmp/exact.jsonl', new Set(['exact-1'])]]),
  )

  expect(result.joined).toEqual([
    {
      repo: 'goule-repo', branch: 'main', minutes: 60,
      sessionIds: ['exact-session'], commitShas: ['exact-1'], confidence: 'exact',
    },
    {
      repo: 'goule-repo', branch: 'main', minutes: 30,
      sessionIds: ['heuristic-session'], commitShas: ['heuristic-1'], confidence: 'heuristic',
    },
  ])
  expect(result.unattributed.sessions.map((s) => s.id)).toEqual(['outside-session'])
  expect(result.unattributed.commits.map((c) => c.sha)).toEqual(['orphan-1'])
})

test('exact session 没有可达 commit 时不静默降级为 heuristic', () => {
  const item: JoinSession = {
    session: session({
      id: 'exact-no-match',
      file: '/tmp/exact-no-match.jsonl',
      events: [
        { at: Date.parse('2026-08-29T09:00:00Z'), kind: 'human' },
        { at: Date.parse('2026-08-29T10:00:00Z'), kind: 'agent' },
      ],
      git: { branch: 'main', commitHash: 'missing-base', remoteUrl: null },
    }),
    minutes: 30,
  }
  const result = joinSessionsAndCommits([repo], [item], new Map([['/tmp/exact-no-match.jsonl', new Set()]]))
  expect(result.joined[0]!.confidence).toBe('exact')
  expect(result.joined[0]!.commitShas).toEqual([])
  expect(result.unattributed.commits.map((c) => c.sha)).toEqual(['exact-1', 'heuristic-1', 'orphan-1'])
})

test('joinScannedData 使用 Codex commit_hash..HEAD 生成 exact 关联', async () => {
  const repoPath = mkdtempSync(join(tmpdir(), 'goule-git-join-'))
  tempDirs.push(repoPath)
  const git = (args: string[], env?: Record<string, string>) => {
    const result = Bun.spawnSync(['git', '-C', repoPath, ...args], {
      stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env },
    })
    if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr))
    return result.stdout ? new TextDecoder().decode(result.stdout).trim() : ''
  }
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'tester@example.com'])
  git(['config', 'user.name', 'Tester'])
  writeFileSync(join(repoPath, 'base.txt'), 'base\n')
  git(['add', 'base.txt'])
  git(['commit', '-m', 'chore: base'], {
    GIT_AUTHOR_DATE: '2026-08-28T10:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-08-28T10:00:00+08:00',
  })
  const baseSha = git(['rev-parse', 'HEAD'])
  writeFileSync(join(repoPath, 'change.txt'), 'change\n')
  git(['add', 'change.txt'])
  git(['commit', '-m', 'feat: exact change'], {
    GIT_AUTHOR_DATE: '2026-08-29T10:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-08-29T10:00:00+08:00',
  })

  const scanned = await scanGit([repoPath], dayRange('2026-08-29', 4, 'Asia/Shanghai'))
  const item: JoinSession = {
    session: session({
      id: 'codex-exact', file: join(repoPath, 'session.jsonl'), cwd: repoPath,
      events: [
        { at: Date.parse('2026-08-29T09:00:00Z'), kind: 'human' },
        { at: Date.parse('2026-08-29T11:00:00Z'), kind: 'agent' },
      ],
      git: { branch: 'main', commitHash: baseSha, remoteUrl: null },
    }),
    minutes: 30,
  }
  const result = await joinScannedData(scanned.repos, [item])
  expect(result.joined[0]).toMatchObject({ confidence: 'exact', commitShas: [scanned.repos[0]!.commits[0]!.sha] })
  expect(result.unattributed.commits).toEqual([])
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
