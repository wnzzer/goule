import PDFDocument from 'pdfkit'
import { existsSync } from 'node:fs'
import { dependencyPath, packagePath } from '../runtime/paths'
import type { DayFactsLite } from '../scan'
import { summarizeBusinessChanges } from './business'
import { dayFactsMouse, finite, formatMinutes, hourMax, hourValues, titleForSession } from './view'

const FONT_CANDIDATES = [
  process.env.GOULE_PDF_FONT,
  // Noto Sans SC 只取简体中文 400 子集，避免依赖系统字体导致 PDF 出现方框字。
  dependencyPath('@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff'),
  '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  'C:/Windows/Fonts/msyh.ttc',
].filter((path): path is string => Boolean(path))

function findFont(): string | null {
  return FONT_CANDIDATES.find((path) => existsSync(path)) ?? null
}

const ICON_PATH = packagePath('assets', 'icon.png')

function textValue(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function shorten(value: unknown, max: number): string {
  const text = textValue(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor('#172033').fontSize(15).text(title, 42, y)
  return y + 25
}

function drawMetric(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string, detail: string, color: string): void {
  doc.roundedRect(x, y, width, 67, 10).fill('#f7f8fb').stroke('#e7eaf0')
  doc.fillColor('#667085').fontSize(8).text(label, x + 10, y + 10)
  doc.fillColor(color).fontSize(18).text(value, x + 10, y + 27)
  doc.fillColor('#7b8496').fontSize(7).text(detail, x + 10, y + 51)
}

/** 生成 A4 本地日报 PDF；使用系统字体以支持中文，找不到中文字体时仍可导出英文/数字内容。 */
export async function renderPdfReport(facts: DayFactsLite): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `${facts.dayId} 工作日报`, Author: 'Goule' } })
  const font = findFont()
  if (font) doc.font(font)
  const chunks: Uint8Array[] = []
  const done = new Promise<void>((resolve) => doc.on('end', resolve))
  doc.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)))

  doc.roundedRect(42, 42, 511, 118, 18).fill('#263a8e')
  if (existsSync(ICON_PATH)) doc.image(ICON_PATH, 465, 65, { width: 72 })
  doc.fillColor('#dce3ff').fontSize(8).text('GOULE · ENOUGH, CLOCK OUT', 62, 64)
  doc.fillColor('#ffffff').fontSize(25).text(`${facts.dayId} 工作日报`, 62, 82)
  doc.fillColor('#dce3ff').fontSize(10).text(`今天完成 ${facts.git.totals.commits} 项变更`, 62, 119)
  doc.fillColor('#c4ceff').fontSize(8).text(`${facts.boundary.tz}  ·  逻辑日 ${facts.boundary.cutoffHour}:00 起`, 62, 140)

  const mouse = dayFactsMouse(facts)
  const metricY = 178
  drawMetric(doc, 42, metricY, 120, '真人投入', formatMinutes(facts.activity.handsOn.minutes), '唯一工时口径', '#4169e1')
  drawMetric(doc, 172, metricY, 120, 'Agent 活动', formatMinutes(facts.activity.agent.minutes), '独立产出证据', '#7c5cff')
  drawMetric(doc, 302, metricY, 120, 'Git commits', `${facts.git.totals.commits} 个`, `+${facts.git.totals.insertions}/-${facts.git.totals.deletions}`, '#159570')
  drawMetric(doc, 432, metricY, 121, '鼠标点击', mouse.enabled || mouse.clicks > 0 ? `${mouse.clicks} 次` : '未启用', '参考活动证据', '#c97809')

  let y = 272
  y = drawSectionTitle(doc, '真人投入时段', y)
  const hours = hourValues(facts)
  const max = hourMax(hours)
  const barX = 48
  const baseY = y + 74
  doc.strokeColor('#e7eaf0').moveTo(barX, baseY + 1).lineTo(548, baseY + 1).stroke()
  hours.forEach((value, hour) => {
    const height = Math.max(2, (value / max) * 58)
    const x = barX + hour * 20.8
    doc.roundedRect(x, baseY - height, 12, height, 3).fill('#5368dd')
    doc.fillColor('#7b8496').fontSize(6).text(String(hour).padStart(2, '0'), x - 1, baseY + 6, { width: 15, align: 'center' })
  })
  y = baseY + 28

  y = drawSectionTitle(doc, '今天做了什么', y)
  const business = summarizeBusinessChanges(facts, 8)
  if (business.length === 0) {
    doc.fillColor('#667085').fontSize(9).text('今天没有发现已配置仓库的 commit。', 48, y)
    y += 20
  } else {
    for (const item of business) {
      if (y > 700) { doc.addPage(); y = 48; y = drawSectionTitle(doc, '今天做了什么（续）', y) }
      doc.fillColor('#4169e1').fontSize(8).text(String(item.title).slice(0, 18), 48, y, { width: 54, height: 16, ellipsis: true })
      doc.fillColor('#172033').fontSize(9).text(shorten(`需求：${item.requirement}`, 88), 108, y, { width: 330, height: 18, ellipsis: true })
      doc.fillColor('#7b8496').fontSize(7).text(shorten(`依据：${item.source}`, 27), 448, y, { width: 100, height: 16, align: 'right', ellipsis: true })
      doc.fillColor('#7b8496').fontSize(7).text(shorten(item.evidence, 86), 108, y + 20, { width: 440, height: 14, ellipsis: true })
      y += 40
    }
  }

  if (y > 710) { doc.addPage(); y = 48 }
  y += 8
  y = drawSectionTitle(doc, 'Session 关联成果', y)
  if (facts.joined.length === 0) {
    doc.fillColor('#667085').fontSize(9).text('暂无成功关联的 session。', 48, y)
    y += 20
  } else {
    for (const item of facts.joined) {
      doc.fillColor('#172033').fontSize(9).text(shorten(`${textValue(item.repo)}/${textValue(item.branch ?? 'unknown')}`, 34), 48, y, { width: 205, height: 16, ellipsis: true })
      doc.fillColor('#667085').fontSize(8).text(`${item.sessionIds.length} session · ${formatMinutes(item.minutes)} → ${item.commitShas.length} commit`, 260, y, { width: 205 })
      doc.fillColor(item.confidence === 'exact' ? '#159570' : '#c97809').fontSize(8).text(item.confidence, 480, y, { width: 68, align: 'right' })
      y += 18
    }
  }

  if (y > 710) { doc.addPage(); y = 48 }
  y += 8
  y = drawSectionTitle(doc, '压力信号', y)
  const fired = facts.stress.signals.filter((signal) => signal.fired)
  if (fired.length === 0) {
    doc.roundedRect(48, y - 3, 500, 31, 8).fill('#eefaf5')
    doc.fillColor('#167458').fontSize(9).text('OK  今天没有触发压力信号，保持这个节奏。', 60, y + 7)
    y += 40
  } else {
    for (const signal of fired) {
      doc.fillColor('#c97809').fontSize(9).text(`• ${textValue(signal.id)}`, 48, y)
      doc.fillColor('#667085').fontSize(8).text(`观测值 ${finite(signal.value)} · 阈值 ${finite(signal.threshold)}`, 170, y)
      y += 17
    }
  }

  y += 12
  doc.fillColor('#9aa3b5').fontSize(7).text('Goule · Enough, clock out. · 本报告由本地事实数据生成', 42, Math.min(y, 790), { width: 511, align: 'center' })
  doc.end()
  await done
  const total = chunks.reduce((size, chunk) => size + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength }
  return out
}
