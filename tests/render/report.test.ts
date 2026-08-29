import { expect, test } from 'bun:test'
import { renderReport } from '../../src/render/report'
import type { DayFactsLite } from '../../src/scan'

test('renderReport 输出 Git 总结、关联和未关联项', () => {
  const facts = {
    dayId: '2026-08-29',
    activity: {
      handsOn: { minutes: 120 },
      agent: { minutes: 30 },
      mouseClicks: { enabled: true, clicks: 12, coverage: 'partial' },
    },
    sessions: [{ id: 'session-1' }],
    git: {
      repos: [{
        name: 'goule', branch: 'main', commits: [{
          sha: '1234567890abcdef', subject: 'feat(parser): scan commits', type: 'feat', scope: 'parser',
          files: 2, insertions: 10, deletions: 1, isMerge: false,
        }],
      }],
      totals: { commits: 1, files: 2, insertions: 10, deletions: 1, repos: 1 },
    },
    joined: [{ repo: 'goule', branch: 'main', minutes: 60, sessionIds: ['session-1'], commitShas: ['1234567890abcdef'], confidence: 'exact' }],
    unattributed: {
      sessions: [{ id: 'outside', tool: 'codex', title: null, cwd: '/tmp', branch: null, minutes: 0, isSidechain: false }],
      commits: [],
    },
    stress: { signals: [{ id: 'weekend_work', fired: true, value: 120, threshold: 60, daysAgo: 0 }], debt: 0.1, baseline: { handsOnP90: 100, windowDays: 30, sufficient: true } },
  } as unknown as DayFactsLite

  const report = renderReport(facts)
  expect(report).toContain('# 2026-08-29 工作日报')
  expect(report).toContain('## Git 总结')
  expect(report).toContain('## 今天做了什么')
  expect(report).toContain('需求：补齐代码提交的扫描和统计')
  expect(report).toContain('代码依据：`feat(parser): scan commits`')
  expect(report).toContain('`12345678` feat(parser): scan commits')
  expect(report).toContain('## Session 关联')
  expect(report).toContain('goule/main')
  expect(report).toContain('未关联 session：1 个')
  expect(report).toContain('鼠标点击参考：12 次')
})
