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
    id: s.id.slice(0, 8),
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
  git: {
    enabled: facts.git.enabled,
    insertions: facts.git.insertions,
    deletions: facts.git.deletions,
    repos: facts.git.repos.map((r) => ({
      path: anonPath(r.path),
      name: r.name,
      branch: r.branch,
      commits: r.commits.length,
      error: r.error,
    })),
    commits: facts.git.commits.map((c) => ({
      hash: c.shortHash,
      at: c.at,
      repoName: c.repoName,
      subject: c.subject,
      description: c.description,
      type: c.type,
      scope: c.scope,
      breaking: c.breaking,
      insertions: c.insertions,
      deletions: c.deletions,
      files: c.files,
      copies: c.copies.length,
      refs: c.refs,
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
