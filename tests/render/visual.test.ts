import { expect, test } from 'bun:test'
import { renderHtmlReport } from '../../src/render/html'
import { renderPdfReport } from '../../src/render/pdf'
import { renderSharePng, renderShareSvg } from '../../src/render/share'
import type { DayFactsLite } from '../../src/scan'

const facts = {
  dayId: '2026-08-29',
  boundary: { start: 0, end: 1, cutoffHour: 4, tz: 'Asia/Shanghai' },
  generatedAt: 0,
  activity: {
    handsOn: { minutes: 125, byHour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 55, 15, 0, 0, 15, 20, 0, 0, 0, 0, 0, 0, 0, 0] },
    agent: { minutes: 42 },
    mouseClicks: { enabled: true, clicks: 88, byHour: new Array(24).fill(0), observedMinutes: 90, coverage: 'partial' },
  },
  sessions: [{ id: 's-1', tool: 'codex', title: '补充导出', cwd: '/tmp/work', branch: 'main', minutes: 60, isSidechain: false }],
  git: {
    repos: [{ name: 'goule', branch: 'main', path: '/tmp/goule', commits: [{ sha: '1234567890abcdef', subject: 'feat: add report export', type: 'feat', scope: null, files: 3, insertions: 88, deletions: 12, isMerge: false }] }],
    totals: { commits: 1, files: 3, insertions: 88, deletions: 12, repos: 1 },
  },
  joined: [{ repo: 'goule', branch: 'main', minutes: 60, sessionIds: ['s-1'], commitShas: ['1234567890abcdef'], confidence: 'exact' }],
  unattributed: { sessions: [], commits: [] },
  stress: { signals: [], debt: 0, baseline: { handsOnP90: 200, windowDays: 30, sufficient: true } },
} as unknown as DayFactsLite

test('HTML 日报包含图文模块和内联数据', () => {
  const html = renderHtmlReport(facts)
  expect(html).toContain('<!doctype html>')
  expect(html).toContain('真人投入时段')
  expect(html).toContain('feat: add report export')
  expect(html).toContain('日报导出与分享')
  expect(html).toContain('让用户可以把日报导出成 PDF 或生成分享图')
  expect(html).toContain('补充导出')
  expect(html).toContain('鼠标点击')
  expect(html).not.toContain('https://')
})

test('分享图 SVG 不泄露路径和 SHA', () => {
  const svg = renderShareSvg(facts)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('2026-08-29 工作日报')
  expect(svg).toContain('data-goule-logo="true"')
  expect(svg).toContain('feat: add report export')
  expect(svg).not.toContain('/tmp/work')
  expect(svg).not.toContain('1234567890abcdef')
})

test('分享图 PNG 和 PDF 都能生成有效文件', async () => {
  const png = renderSharePng(facts)
  expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const pngHeader = new DataView(png.buffer, png.byteOffset, png.byteLength)
  expect(pngHeader.getUint32(16)).toBe(2400)
  expect(pngHeader.getUint32(20)).toBe(1800)

  const pdf = await renderPdfReport(facts)
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
  expect(pdf.byteLength).toBeGreaterThan(10_000)
}, { timeout: 20_000 })
