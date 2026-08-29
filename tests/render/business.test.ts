import { expect, test } from 'bun:test'
import { businessOverview, summarizeCommit } from '../../src/render/business'

const base = {
  sha: '12345678',
  ts: 0,
  type: 'feat',
  scope: null,
  files: 3,
  insertions: 88,
  deletions: 12,
  isMerge: false,
}

test('把日报导出提交翻译成可读的业务需求，并保留代码依据', () => {
  const summary = summarizeCommit({
    ...base,
    subject: 'feat: add visual report exports',
    filesChanged: ['src/render/pdf.ts', 'src/render/share.ts'],
  }, 'goule')

  expect(summary.title).toBe('新增：日报导出与分享')
  expect(summary.requirement).toContain('PDF')
  expect(summary.requirement).toContain('分享图')
  expect(summary.evidence).toContain('src/render/pdf.ts')
  expect(summary.source).toBe('feat: add visual report exports')
})

test('未知提交仍有安全的降级描述，不臆测业务', () => {
  const summary = summarizeCommit({
    ...base,
    type: null,
    subject: 'wire-up-zebra',
  })

  expect(summary.title).toBe('完成：wire up zebra')
  expect(summary.requirement).toContain('wire up zebra')
  expect(businessOverview([summary])).toContain('代码交付')
})

test('提交标题优先于顺手改到的文件，避免业务归类被误导', () => {
  const summary = summarizeCommit({
    ...base,
    subject: 'feat: improve daily report and date navigation',
    filesChanged: ['src/render/report.ts', 'src/render/pdf.ts'],
  }, 'goule')

  expect(summary.title).toBe('优化：日报内容与历史归档')
  expect(summary.requirement).toContain('指定日期')
})
