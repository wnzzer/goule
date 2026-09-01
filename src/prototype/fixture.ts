import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { renderPdfReport } from '../render/pdf'
import { summarizeCommit } from '../render/business'
import { renderSharePng, renderShareSvg } from '../render/share'
import { scanDay, type DayFactsLite } from '../scan'
import { packagePath } from '../runtime/paths'
import { DEFAULT_CONFIG, resolveTz } from '../types/config'
import { logicalDay, parseDayId } from '../types/day'
import { totalTokens, uncachedInput } from '../types/session'

const anonPath = (path: string | null): string | null =>
  path === null ? null : path.replace(/\/Users\/[^/]+/, '/Users/you')

function shiftDay(day: string, delta: number): string {
  if (!parseDayId(day)) throw new Error(`非法日期：${day}（应为 YYYY-MM-DD）`)
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

async function toFixture(facts: DayFactsLite, exportDir: string) {
  const sessions = facts.sessions
    .filter((session) => session.minutes > 0 || totalTokens(session.tokens) > 0)
    .map((session) => ({
      id: session.id.slice(0, 8),
      tool: session.tool,
      title: session.title,
      cwd: anonPath(session.cwd),
      branch: session.branch,
      isSidechain: session.isSidechain,
      minutes: session.minutes,
      tokens: session.tokens,
    }))
    .sort((a, b) => b.tokens.output - a.tokens.output || b.minutes - a.minutes)

  const data = {
    dayId: facts.dayId,
    generatedAt: facts.generatedAt,
    boundary: { start: facts.boundary.start, end: facts.boundary.end },
    handBlocks: facts.activity.handsOn.blocks.map((block) => [block.start, block.end]),
    agentBlocks: facts.activity.agent.blocks.map((block) => [block.start, block.end]),
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
    git: {
      enabled: facts.git.repos.length > 0,
      insertions: facts.git.totals.insertions,
      deletions: facts.git.totals.deletions,
      repos: facts.git.repos.map((repo) => ({
        path: anonPath(repo.path),
        name: repo.name,
        branch: repo.branch,
        commits: repo.commits.length,
        error: null,
      })),
      commits: facts.git.repos.flatMap((repo) => repo.commits.map((commit) => ({
        hash: commit.sha.slice(0, 7),
        at: commit.ts,
        repoName: repo.name,
        subject: commit.subject,
        description: commit.subject.replace(/^[A-Za-z]+(\([^)]*\))?!?:\s*/, ''),
        type: commit.type,
        scope: commit.scope,
        filesChanged: commit.filesChanged ?? [],
        business: summarizeCommit(commit, repo.name),
        breaking: /^[A-Za-z]+(\([^)]*\))?!:/.test(commit.subject),
        insertions: commit.insertions,
        deletions: commit.deletions,
        files: commit.files,
        isMerge: commit.isMerge,
        copies: 0,
        refs: [],
      }))).sort((a, b) => a.at - b.at),
    },
    joined: facts.joined.map((item) => ({
      repo: item.repo,
      branch: item.branch,
      confidence: item.confidence,
      sessionIds: item.sessionIds.map((id) => id.slice(0, 8)),
      commitShas: item.commitShas.map((sha) => sha.slice(0, 7)),
    })),
    unattributed: {
      sessions: facts.unattributed.sessions.length,
      commits: facts.unattributed.commits.length,
    },
    exports: {
      pdf: `./exports/${facts.dayId}.pdf`,
      sharePng: `./exports/${facts.dayId}-share.png`,
      shareSvg: `./exports/${facts.dayId}-share.svg`,
    },
  }

  await writeFile(join(exportDir, `${facts.dayId}.pdf`), await renderPdfReport(facts))
  await writeFile(join(exportDir, `${facts.dayId}-share.png`), renderSharePng(facts))
  await writeFile(join(exportDir, `${facts.dayId}-share.svg`), renderShareSvg(facts))
  return data
}

export interface FixtureSummary {
  out: string
  archiveDays: number
  dayId: string
  sessions: number
  commits: number
  handMinutes: number
  mouseClicks: number | null
}

export async function generatePrototypeFixture(
  requestedDay?: string,
  output = packagePath('prototypes', 'dusk-ledger', 'fixture.js'),
  requestedArchiveDays = 7,
): Promise<FixtureSummary> {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const dayId = requestedDay ?? logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, tz)
  const archiveDays = Math.max(1, Math.min(31, Number(requestedArchiveDays) || 7))
  const archiveDayIds = Array.from({ length: archiveDays }, (_, index) => shiftDay(dayId, -index))
  const out = resolve(output)
  const exportDir = join(dirname(out), 'exports')
  mkdirSync(exportDir, { recursive: true })

  const archive: Record<string, Awaited<ReturnType<typeof toFixture>>> = {}
  for (const id of archiveDayIds) archive[id] = await toFixture(await scanDay(id, DEFAULT_CONFIG), exportDir)

  const current = archive[dayId]!
  const banner = `// 由 Goule 生成，请勿手改\n`
    + `// 数据归档：${archiveDayIds.length} 天，当前日 ${dayId}，生成于 ${new Date().toISOString()}\n`
  await writeFile(out,
    `${banner}window.GOULE_ARCHIVE = ${JSON.stringify(archive, null, 2)};\n`
    + `window.GOULE_DATA = window.GOULE_ARCHIVE[${JSON.stringify(dayId)}];\n`,
  )

  return {
    out,
    archiveDays: archiveDayIds.length,
    dayId,
    sessions: current.sessions.length,
    commits: current.git.commits.length,
    handMinutes: current.handMinutes,
    mouseClicks: current.mouse.enabled ? current.mouse.clicks : null,
  }
}
