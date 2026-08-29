import { Resvg } from '@resvg/resvg-js'
import type { DayFactsLite } from '../scan'
import { dayFactsMouse, escapeXml, formatCompactMinutes, hourMax, hourValues, topCommits } from './view'

/** 1200×900 的社交分享卡片，默认不包含路径、SHA、分支等敏感字段。 */
export function renderShareSvg(facts: DayFactsLite): string {
  const mouse = dayFactsMouse(facts)
  const hours = hourValues(facts)
  const max = hourMax(hours)
  const commits = topCommits(facts, 3)
  const joined = facts.joined.reduce((sum, item) => sum + item.commitShas.length, 0)
  const lines = commits.length > 0
    ? commits.map((commit, index) => `<text x="72" y="${610 + index * 38}" class="commit">${index + 1}. ${escapeXml(commit.subject.slice(0, 62))}</text>`).join('')
    : '<text x="72" y="610" class="muted">今天没有 Git commit</text>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17234d"/><stop offset=".62" stop-color="#3f55b7"/><stop offset="1" stop-color="#805cdb"/></linearGradient><linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#92a0ff"/><stop offset="1" stop-color="#d9ddff"/></linearGradient></defs>
<rect width="1200" height="900" rx="38" fill="#f5f6fa"/><rect x="24" y="24" width="1152" height="852" rx="32" fill="url(#bg)"/>
<circle cx="1040" cy="105" r="170" fill="#ffffff" opacity=".08"/><circle cx="1140" cy="780" r="220" fill="#ffffff" opacity=".05"/>
<text x="72" y="92" class="eyebrow">GOULE · ENOUGH, CLOCK OUT</text><text x="72" y="154" class="title">${escapeXml(facts.dayId)} 工作日报</text><text x="72" y="192" class="subtitle">事实层证据 · 本地生成 · 不含对话正文</text>
<g transform="translate(72 244)"><rect width="250" height="128" rx="20" fill="#ffffff" opacity=".14"/><text x="22" y="36" class="label">真人投入</text><text x="22" y="84" class="number">${escapeXml(formatCompactMinutes(facts.activity.handsOn.minutes))}</text><text x="22" y="109" class="hint">唯一工时口径</text></g>
<g transform="translate(340 244)"><rect width="250" height="128" rx="20" fill="#ffffff" opacity=".14"/><text x="22" y="36" class="label">Agent 活动</text><text x="22" y="84" class="number">${escapeXml(formatCompactMinutes(facts.activity.agent.minutes))}</text><text x="22" y="109" class="hint">独立产出证据</text></g>
<g transform="translate(608 244)"><rect width="250" height="128" rx="20" fill="#ffffff" opacity=".14"/><text x="22" y="36" class="label">Git commits</text><text x="22" y="84" class="number">${facts.git.totals.commits}</text><text x="22" y="109" class="hint">+${facts.git.totals.insertions}/-${facts.git.totals.deletions}</text></g>
<g transform="translate(876 244)"><rect width="250" height="128" rx="20" fill="#ffffff" opacity=".14"/><text x="22" y="36" class="label">鼠标点击</text><text x="22" y="84" class="number">${mouse.enabled || mouse.clicks > 0 ? mouse.clicks : '—'}</text><text x="22" y="109" class="hint">参考活动证据</text></g>
<rect x="72" y="408" width="1056" height="1" fill="#ffffff" opacity=".2"/><text x="72" y="458" class="section">今日节奏</text>
<g transform="translate(72 480)">${hours.map((value, hour) => { const h = Math.max(5, Math.round((value / max) * 90)); const x = hour * 43.5; return `<rect x="${x.toFixed(1)}" y="${100 - h}" width="26" height="${h}" rx="8" fill="url(#bar)" opacity="${value > 0 ? 1 : .28}"/><text x="${(x + 13).toFixed(1)}" y="124" text-anchor="middle" class="axis">${String(hour).padStart(2, '0')}</text>` }).join('')}</g>
<text x="72" y="568" class="section">今日交付</text>${lines}
<text x="72" y="760" class="foot">${facts.git.repos.length} 个仓库 · ${facts.sessions.length} 个 AI session · ${joined} 个已关联 commit</text><text x="72" y="804" class="brand">Goule</text><text x="1128" y="804" text-anchor="end" class="foot">Enough, clock out.</text>
<style>.eyebrow{font:700 16px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;letter-spacing:3px;fill:#d9e0ff}.title{font:700 48px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#fff}.subtitle{font:400 20px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#d9e0ff}.label{font:500 17px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#d9e0ff}.number{font:700 38px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#fff}.hint{font:400 14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#d9e0ff}.section{font:700 22px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#fff}.commit{font:500 19px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#fff}.muted{font:400 19px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#cbd4ff}.axis{font:400 12px -apple-system,BlinkMacSystemFont,sans-serif;fill:#bec9ff}.foot{font:400 16px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#cbd4ff}.brand{font:700 24px -apple-system,BlinkMacSystemFont,sans-serif;fill:#fff}</style></svg>`
}

export function renderSharePng(facts: DayFactsLite): Uint8Array {
  return new Resvg(renderShareSvg(facts), { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}

