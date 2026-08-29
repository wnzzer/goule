import { Resvg } from '@resvg/resvg-js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DayFactsLite } from '../scan'
import { summarizeBusinessChanges } from './business'
import { dayFactsMouse, escapeXml, formatCompactMinutes, hourMax, hourValues } from './view'

const SHARE_FONT_FILES = [
  join(import.meta.dir, '../../node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff'),
  join(import.meta.dir, '../../node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff'),
].filter((path) => existsSync(path))

function shorten(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function metricCard(x: number, label: string, value: string, detail: string, color: string): string {
  return `<g transform="translate(${x} 270)">
  <rect width="244" height="104" rx="14" fill="#f8fbf9" stroke="#dfe9e3"/>
  <rect width="4" height="104" rx="2" fill="${color}"/>
  <text x="20" y="29" class="metric-label">${escapeXml(label)}</text>
  <text x="20" y="67" class="metric-value" fill="${color}">${escapeXml(value)}</text>
  <text x="20" y="89" class="metric-detail">${escapeXml(detail)}</text>
</g>`
}

/**
 * 1200×900 的白底社交分享卡片。
 * 内容顺序固定为：日期 → 交付结果 → 少量指标 → 工作节奏，
 * 让不了解 Goule 的读者也能在几秒内读懂今天做了什么。
 */
export function renderShareSvg(facts: DayFactsLite): string {
  const mouse = dayFactsMouse(facts)
  const hours = hourValues(facts)
  const max = hourMax(hours)
  const business = summarizeBusinessChanges(facts, 5)
  const totalCommitCount = facts.git.totals.commits || business.length
  const titledSessions = facts.sessions.filter((session) => session.title?.trim()).slice(0, 3)
  const joined = facts.joined.reduce((sum, item) => sum + item.commitShas.length, 0)
  const workItems = business.length > 0
    ? business.map((item) => ({ title: item.title, meta: `需求：${item.requirement}`, source: item.source }))
    : titledSessions.map((session) => ({
        title: `进行中：${session.title!.trim()}`,
        meta: `${session.branch ?? '未识别分支'} · ${formatCompactMinutes(session.minutes)}`,
        source: session.title!,
      }))

  const workRows = workItems.length > 0
    ? workItems.map((item, index) => {
        const y = 526 + index * 54
        return `<g>
  <circle cx="91" cy="${y - 7}" r="17" fill="#e5f5ee"/>
  <text x="91" y="${y - 1}" text-anchor="middle" class="work-index">${String(index + 1).padStart(2, '0')}</text>
  <title>${escapeXml(item.source)}</title>
  <text x="122" y="${y - 8}" class="work-title">${escapeXml(shorten(item.title, 47))}</text>
  <text x="122" y="${y + 18}" class="work-meta">${escapeXml(shorten(item.meta, 58))}</text>
  ${index < workItems.length - 1 ? `<line x1="72" y1="${y + 30}" x2="780" y2="${y + 30}" stroke="#e6eee9"/>` : ''}
</g>`
      }).join('')
    : `<text x="72" y="526" class="empty">今天没有可识别的交付项</text>`

  const barStartX = 850
  const barWidth = 7
  const barGap = 3
  const barBaseY = 610
  const barHeight = 82
  const bars = hours.map((value, hour) => {
    const height = value > 0 ? Math.max(5, Math.round((value / max) * barHeight)) : 2
    const x = barStartX + hour * (barWidth + barGap)
    return `<rect x="${x}" y="${barBaseY - height}" width="${barWidth}" height="${height}" rx="3" fill="${value > 0 ? '#0a8f6a' : '#dce9e2'}"/>`
  }).join('')

  const completionLabel = totalCommitCount > 0 ? `${totalCommitCount} 项交付` : workItems.length > 0 ? '进行中' : '暂无交付'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-labelledby="share-title share-desc">
<title id="share-title">${escapeXml(facts.dayId)} 工作日报</title>
<desc id="share-desc">今天完成 ${totalCommitCount} 项代码交付，包含 ${facts.git.totals.repos} 个仓库和 ${facts.sessions.length} 个 AI session。</desc>
<rect width="1200" height="900" fill="#f3f7f4"/>
<rect x="32" y="28" width="1136" height="844" rx="28" fill="#ffffff" stroke="#dfe9e3" stroke-width="2"/>
<rect x="32" y="28" width="8" height="844" rx="4" fill="#0a8f6a"/>

<g transform="translate(72 70)">
  <rect width="40" height="40" rx="11" fill="#0a8f6a"/>
  <text x="20" y="28" text-anchor="middle" class="mark">G</text>
  <text x="56" y="18" class="brand">Goule</text>
  <text x="56" y="35" class="eyebrow">DAILY WORK SUMMARY</text>
</g>
<rect x="938" y="74" width="172" height="36" rx="18" fill="#eaf7f1"/>
<circle cx="962" cy="92" r="5" fill="#0a8f6a"/>
<text x="978" y="98" class="status">${escapeXml(completionLabel)}</text>

<text x="72" y="180" class="title">${escapeXml(facts.dayId)} 工作日报</text>
<text x="72" y="216" class="subtitle">今天完成 ${totalCommitCount} 项代码交付，以下是可以直接分享的进展。</text>

${metricCard(72, '提交', `${facts.git.totals.commits} 个`, '今天落地的改动', '#0a8f6a')}
${metricCard(334, '改动行数', `${facts.git.totals.insertions + facts.git.totals.deletions} 行`, `+${facts.git.totals.insertions} / −${facts.git.totals.deletions}`, '#3978a5')}
${metricCard(596, '真人投入', formatCompactMinutes(facts.activity.handsOn.minutes), '唯一工时口径', '#7564b8')}
${metricCard(858, '鼠标点击', mouse.enabled || mouse.clicks > 0 ? `${mouse.clicks} 次` : '未开启', '活动参考，不计工时', '#b27627')}

<line x1="72" y1="414" x2="1128" y2="414" stroke="#e2ebe5" stroke-width="2"/>
<text x="72" y="462" class="section">今天做了什么</text>
<text x="72" y="488" class="section-note">按交付结果整理，别人打开就能看懂</text>
${workRows}

<g>
  <rect x="824" y="438" width="304" height="290" rx="18" fill="#f8fbf9" stroke="#dfe9e3"/>
  <text x="850" y="478" class="chart-title">工作节奏</text>
  <text x="850" y="502" class="chart-note">真人投入 · 按本地小时</text>
  <line x1="850" y1="611" x2="1100" y2="611" stroke="#dce8e1"/>
  ${bars}
  <text x="850" y="638" class="axis">00</text><text x="912" y="638" class="axis">06</text><text x="974" y="638" class="axis">12</text><text x="1036" y="638" class="axis">18</text><text x="1090" y="638" text-anchor="end" class="axis">23</text>
  <text x="850" y="682" class="chart-foot">只记录有输入的时段</text>
  <text x="850" y="703" class="chart-foot">不读取代码内容</text>
</g>

<line x1="72" y1="780" x2="1128" y2="780" stroke="#e2ebe5"/>
<text x="72" y="824" class="footer-left">Goule · 本地生成 · 不含对话正文</text>
<text x="1128" y="824" text-anchor="end" class="footer-right">${facts.git.totals.repos} 个仓库 · ${facts.sessions.length} 个 AI session · ${joined} 个已关联 commit</text>

<style>
  text { font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
  .mark { font: 700 22px Arial, sans-serif; fill: #fff; }
  .brand { font-size: 17px; font-weight: 700; fill: #182620; }
  .eyebrow { font-size: 10px; letter-spacing: 2px; fill: #719087; }
  .status { font-size: 13px; font-weight: 600; fill: #14704f; }
  .title { font-size: 34px; font-weight: 700; fill: #182620; }
  .subtitle { font-size: 16px; fill: #61736b; }
  .metric-label { font-size: 13px; fill: #61736b; }
  .metric-value { font: 700 25px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
  .metric-detail { font-size: 11px; fill: #82938b; }
  .section { font-size: 22px; font-weight: 700; fill: #182620; }
  .section-note { font-size: 13px; fill: #809088; }
  .work-index { font: 600 11px "IBM Plex Mono", monospace; fill: #0a8f6a; }
  .work-title { font-size: 18px; font-weight: 600; fill: #1e2d26; }
  .work-meta { font-size: 12px; fill: #71837a; }
  .empty { font-size: 16px; fill: #71837a; }
  .chart-title { font-size: 18px; font-weight: 700; fill: #1e2d26; }
  .chart-note, .chart-foot { font-size: 12px; fill: #71837a; }
  .axis { font: 11px "IBM Plex Mono", monospace; fill: #8a9a92; }
  .footer-left, .footer-right { font-size: 12px; fill: #809088; }
</style>
</svg>`
}

export function renderSharePng(facts: DayFactsLite): Uint8Array {
  // 以 2× 尺寸导出，分享平台缩放后仍能保持中文笔画和数字边缘清楚。
  // 显式加载项目内 Noto Sans SC，避免机器缺少中文字体时发生替换或变形。
  return new Resvg(renderShareSvg(facts), {
    fitTo: { mode: 'width', value: 2400 },
    shapeRendering: 2,
    textRendering: 1,
    font: {
      loadSystemFonts: true,
      fontFiles: SHARE_FONT_FILES,
      fontDirs: ['/System/Library/Fonts', '/Library/Fonts', '/usr/share/fonts', '/usr/local/share/fonts'],
      defaultFontFamily: 'Noto Sans SC',
      sansSerifFamily: 'Noto Sans SC',
      monospaceFamily: 'IBM Plex Mono',
    },
  }).render().asPng()
}
