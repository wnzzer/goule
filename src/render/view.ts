import type { DayFactsLite } from '../scan'

export function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function formatMinutes(value: number): string {
  const minutes = Math.max(0, finite(value))
  if (minutes < 1) return `${Math.round(minutes * 60)} 秒`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes - hours * 60)
  if (hours > 0) return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
  return `${Math.round(minutes)} 分钟`
}

export function formatCompactMinutes(value: number): string {
  const minutes = Math.max(0, finite(value))
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes - hours * 60)
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function escapeXml(value: unknown): string {
  return escapeHtml(value)
}

export function dayFactsMouse(facts: DayFactsLite): NonNullable<DayFactsLite['activity']['mouseClicks']> {
  return facts.activity.mouseClicks ?? {
    enabled: false,
    clicks: 0,
    byHour: new Array<number>(24).fill(0),
    observedMinutes: 0,
    coverage: 'unavailable',
    provider: null,
  }
}

export function hourValues(facts: DayFactsLite): number[] {
  const values = facts.activity.handsOn.byHour
  return Array.from({ length: 24 }, (_, hour) => Math.max(0, finite(values?.[hour])))
}

export function hourMax(values: number[]): number {
  return Math.max(1, ...values)
}

export function allCommits(facts: DayFactsLite): DayFactsLite['git']['repos'][number]['commits'] {
  return facts.git.repos.flatMap((repo) => repo.commits)
}

export function topCommits(facts: DayFactsLite, limit = 5) {
  return allCommits(facts)
    .slice()
    .sort((a, b) => (b.insertions + b.deletions) - (a.insertions + a.deletions) || b.ts - a.ts)
    .slice(0, limit)
}

export function repoCommitCount(facts: DayFactsLite): number {
  return allCommits(facts).length
}

export function titleForSession(session: DayFactsLite['sessions'][number]): string {
  return session.title?.trim() || `${session.tool === 'codex' ? 'Codex' : 'Claude Code'} session`
}

