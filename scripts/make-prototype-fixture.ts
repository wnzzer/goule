#!/usr/bin/env bun
/**
 * 用真实 scanDay 输出生成原型 fixture。
 *
 * 原型是设计稿，不是产品：这里只保留渲染需要的字段，并把 /Users/<name>
 * 换成 /Users/you。session 标题、commit 标题会原样带出——它们来自你自己的
 * 机器，提交前请自行确认是否可公开。
 *
 * 用法: bun run scripts/make-prototype-fixture.ts [YYYY-MM-DD] [输出路径]
 */
import { DEFAULT_CONFIG, resolveTz } from '../src/types/config'
import { logicalDay } from '../src/types/day'
import { scanDay } from '../src/scan'
import { totalTokens, uncachedInput } from '../src/types/session'

const anonPath = (p: string | null): string | null =>
  p === null ? null : p.replace(/\/Users\/[^/]+/, '/Users/you')

const tz = resolveTz(DEFAULT_CONFIG.timezone)
const dayId = Bun.argv[2] ?? logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, tz)
const out = Bun.argv[3] ?? 'prototypes/dusk-ledger/fixture.js'

const facts = await scanDay(dayId, DEFAULT_CONFIG)

const sessions = facts.sessions
  .filter((s) => s.minutes > 0 || totalTokens(s.tokens) > 0)
  .map((s) => ({
    id: s.id,
    tool: s.tool,
    title: s.title,
    cwd: anonPath(s.cwd),
    branch: s.branch,
    isSidechain: s.isSidechain,
    minutes: s.minutes,
    tokens: s.tokens,
  }))
  .sort((a, b) => b.tokens.output - a.tokens.output || b.minutes - a.minutes)

const data = {
  dayId: facts.dayId,
  boundary: { start: facts.boundary.start, end: facts.boundary.end },
  handBlocks: facts.activity.handsOn.blocks.map((b) => [b.start, b.end]),
  agentBlocks: facts.activity.agent.blocks.map((b) => [b.start, b.end]),
  handMinutes: facts.activity.handsOn.minutes,
  handsOnByHour: facts.activity.handsOn.byHour,
  agentMinutes: facts.activity.agent.minutes,
  mouse: facts.activity.mouseClicks,
  baseline: facts.stress.baseline,
  signals: facts.stress.signals,
  debt: facts.stress.debt,
  tokens: facts.tokens,
  tokenSummary: {
    output: facts.tokens.output,
    uncachedInput: uncachedInput(facts.tokens),
    cacheRead: facts.tokens.cacheRead,
  },
  sessions,
  // main 的 git 层形状：{ repos: RepoDay[], totals: GitTotals } + joined/unattributed
  git: {
    enabled: facts.git.repos.length > 0,
    insertions: facts.git.totals.insertions,
    deletions: facts.git.totals.deletions,
    repos: facts.git.repos.map((r) => ({
      path: anonPath(r.path),
      name: r.name,
      branch: r.branch,
      commits: r.commits.length,
      error: null,
    })),
    commits: facts.git.repos.flatMap((r) => r.commits.map((c) => ({
      sha: c.sha,
      hash: c.sha.slice(0, 7),
      at: c.ts,
      repoName: r.name,
      subject: c.subject,
      // chip 已经显示 type(scope)，正文里去掉前缀免得重复
      description: c.subject.replace(/^[A-Za-z]+(\([^)]*\))?!?:\s*/, ''),
      type: c.type,
      scope: c.scope,
      breaking: /^[A-Za-z]+(\([^)]*\))?!:/.test(c.subject),
      insertions: c.insertions,
      deletions: c.deletions,
      files: c.files,
      isMerge: c.isMerge,
      copies: 0,
      refs: [],
    }))).sort((a, b) => a.at - b.at),
  },
  // session↔commit 关联（main 的 join.ts 产出）。内部关联键保留全长，避免截断后碰撞。
  joined: facts.joined,
  unattributed: {
    sessions: facts.unattributed.sessions.map((s) => ({
      ...s,
      cwd: anonPath(s.cwd),
    })),
    commits: facts.unattributed.commits.map((c) => ({
      repo: c.repo,
      sha: c.sha,
      hash: c.sha.slice(0, 7),
      at: c.ts,
      subject: c.subject,
    })),
  },
}

const banner = `// 由 scripts/make-prototype-fixture.ts 生成，请勿手改\n`
  + `// 数据日 ${data.dayId}，生成于 ${new Date().toISOString()}\n`
await Bun.write(out, `${banner}window.GOULE_DATA = ${JSON.stringify(data, null, 2)}\n`)

console.log(
  `已写入 ${out}\n`
  + `  session ${sessions.length} 个 · commit ${data.git.commits.length} 条`
  + ` · 动手 ${Math.round(data.handMinutes)}m · 鼠标 ${data.mouse.enabled ? `${data.mouse.clicks} 次` : '未开启'}`,
)
