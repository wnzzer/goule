import type { DayFactsLite } from '../scan'

type Commit = DayFactsLite['git']['repos'][number]['commits'][number]

export interface BusinessSummary {
  /** 面向非开发者的变化标题。 */
  title: string
  /** 把代码变化翻译成用户能理解的需求描述。 */
  requirement: string
  /** 便于按业务模块聚合展示。 */
  area: string
  /** 原始提交标题，保留事实追溯能力。 */
  source: string
  /** 仓库、文件范围和 diff 规模。 */
  evidence: string
}

const actionLabel: Record<string, string> = {
  feat: '新增',
  fix: '修复',
  refactor: '重构',
  perf: '优化',
  docs: '补充文档',
  test: '补充验证',
  chore: '整理',
}

interface BusinessRule {
  pattern: RegExp
  area: string
  concept: string
  requirement: string
}

/**
 * 这是事实层的轻量规则，不调用模型，也不把代码臆测成不存在的业务。
 * 优先识别项目里反复出现的业务词；无法识别时退回到提交标题和文件范围。
 */
const BUSINESS_RULES: BusinessRule[] = [
  {
    pattern: /mouse|click|鼠标|点击/i,
    area: '鼠标活动参考',
    concept: '鼠标点击活动采集',
    requirement: '补充鼠标点击次数作为在场参考；它独立展示，不计入工时，也不参与压力判断。',
  },
  {
    pattern: /visual report|report export|share image|share.*png|pdf|导出|分享图/i,
    area: '日报导出与分享',
    concept: '日报导出与分享',
    requirement: '让用户可以把日报导出成 PDF 或生成分享图，方便保存、转发和向别人说明进展。',
  },
  {
    pattern: /daily report|date navigation|archive|日报|日期|归档/i,
    area: '日报内容与归档',
    concept: '日报内容与历史归档',
    requirement: '让日报先讲清今天完成了什么，并支持按指定日期查看历史归档。',
  },
  {
    pattern: /git daily summary|git summary|session join|join.*session|关联/i,
    area: 'Git 交付与 AI 关联',
    concept: 'Git 交付总结与 AI session 关联',
    requirement: '把 Git 提交整理成可读的交付摘要，并说明 AI session 如何落到具体代码提交。',
  },
  {
    pattern: /pressure|stress|recovery|压力|恢复/i,
    area: '压力与恢复提醒',
    concept: '压力与恢复提醒',
    requirement: '把连续工作、深夜活动等信号说清楚，帮助用户决定何时收工，而不是再增加一个考核分数。',
  },
  {
    pattern: /adr|architecture decision|架构决策/i,
    area: '项目决策记录',
    concept: '项目架构决策记录',
    requirement: '沉淀关键架构选择和原因，方便后来的人理解当前实现。',
  },
  {
    pattern: /session|codex|claude|agent|adapter/i,
    area: 'AI 工作记录',
    concept: 'AI 工作记录',
    requirement: '保留 AI 工作会话的可核对信息，让日报能说明工作是如何推进的。',
  },
  {
    pattern: /git|commit|scanner|parser/i,
    area: 'Git 交付记录',
    concept: 'Git 交付记录',
    requirement: '补齐代码提交的扫描和统计，让当天的交付有可追溯依据。',
  },
]

const PATH_AREAS: Array<{ pattern: RegExp; area: string }> = [
  { pattern: /(?:^|\/)docs\/ADR(?:\/|$)/i, area: '项目决策记录' },
  { pattern: /(?:^|\/)src\/mouse\//i, area: '鼠标活动参考' },
  { pattern: /(?:^|\/)src\/stress\//i, area: '压力与恢复提醒' },
  { pattern: /(?:^|\/)src\/git\//i, area: 'Git 交付与 AI 关联' },
  { pattern: /(?:^|\/)src\/render\/(?:pdf|share)\./i, area: '日报导出与分享' },
  { pattern: /(?:^|\/)src\/render\/(?:report|html)\./i, area: '日报内容与归档' },
  { pattern: /(?:^|\/)src\/adapters\//i, area: 'AI 工作记录' },
]

const termMap: Array<[RegExp, string]> = [
  [/daily\s+report/gi, '日报'],
  [/correct\s+range/gi, '时间范围校正'],
  [/build\s+cache/gi, '构建缓存'],
  [/date\s+navigation/gi, '日期切换'],
  [/mouse\s+click\s+activity/gi, '鼠标点击活动'],
  [/git\s+daily\s+summary/gi, 'Git 日报总结'],
  [/session\s+join/gi, 'session 关联'],
  [/visual\s+report\s+exports?/gi, '日报可视化导出'],
  [/report\s+exports?/gi, '日报导出'],
  [/share\s+(?:image|png)/gi, '分享图'],
  [/metadata/gi, '元数据'],
  [/optional/gi, '可选'],
  [/visual/gi, '可视化'],
  [/exports?/gi, '导出'],
  [/summary/gi, '总结'],
  [/daily/gi, '日报'],
  [/work/gi, '工作'],
  [/correct/gi, '校正'],
  [/range/gi, '范围'],
  [/tidy/gi, '整理'],
  [/cache/gi, '缓存'],
  [/config/gi, '配置'],
  [/layout/gi, '布局'],
  [/style/gi, '样式'],
  [/coverage/gi, '覆盖'],
  [/tests?/gi, '验证'],
  [/join/gi, '关联'],
  [/link/gi, '关联'],
  [/scanner/gi, '扫描'],
  [/parser/gi, '解析'],
  [/archive/gi, '归档'],
  [/pressure/gi, '压力'],
  [/recovery/gi, '恢复'],
  [/activity/gi, '活动'],
  [/session/gi, 'session'],
  [/commit/gi, '提交'],
  [/report/gi, '日报'],
  [/date/gi, '日期'],
  [/navigation/gi, '切换'],
  [/export/gi, '导出'],
  [/clicks?/gi, '点击'],
  [/mouse/gi, '鼠标'],
  [/add/gi, '新增'],
  [/improve/gi, '优化'],
  [/update/gi, '更新'],
  [/support/gi, '支持'],
  [/remove/gi, '移除'],
]

function subjectAfterConventionalPrefix(subject: string): string {
  return subject.replace(/^[A-Za-z]+(?:\([^)]*\))?!?:\s*/, '').trim()
}

function subjectWithoutPrefix(subject: string): string {
  return subjectAfterConventionalPrefix(subject)
    .replace(/^(?:add|added|adding|improve|improved|update|updated|fix|fixed|remove|removed|support|enable|implement|refactor|optimi[sz]e|polish)\b[\s:,-]*/i, '')
    .trim()
}

function actionFor(commit: Commit): string {
  const subject = subjectAfterConventionalPrefix(commit.subject)
  if (/^(?:improve|improved|update|updated|optimi[sz]e|polish)\b/i.test(subject)) return '优化'
  if (/^(?:fix|fixed|correct|resolve|repair)\b/i.test(subject)) return '修复'
  if (/^(?:remove|removed|delete|disable)\b/i.test(subject)) return '移除'
  if (/^(?:add|added|adding|support|enable|implement)\b/i.test(subject)) return '新增'
  return actionLabel[commit.type ?? ''] ?? '完成'
}

function translatedConcept(subject: string): string {
  let text = subjectWithoutPrefix(subject).replace(/[-_]+/g, ' ').trim()
  for (const [pattern, replacement] of termMap) text = text.replace(pattern, replacement)
  text = text.replace(/\s+/g, ' ').trim()
  return text || '未命名变更'
}

function pathsFor(commit: Commit): string[] {
  return (commit.filesChanged ?? []).filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
}

function ruleForArea(area: string): BusinessRule | null {
  return BUSINESS_RULES.find((rule) => rule.area === area) ?? null
}

function ruleFor(commit: Commit): BusinessRule | null {
  const paths = pathsFor(commit)
  // 提交标题是作者对这次业务变化的主动描述，优先级高于“顺手改到的文件”。
  // 例如改日报日期时可能同时触碰 pdf.ts，不能因此误判成“新增导出”。
  const subjectRule = BUSINESS_RULES.find((rule) => rule.pattern.test([commit.subject, commit.scope ?? ''].join(' ')))
  if (subjectRule) return subjectRule
  const pathArea = PATH_AREAS.find((rule) => rule.pattern.test(paths.join(' ')))?.area
  return pathArea ? ruleForArea(pathArea) : null
}

function fallbackRequirement(action: string, concept: string): string {
  switch (action) {
    case '新增': return `让用户可以使用「${concept}」，并在日报中看到对应结果。`
    case '修复': return `修复「${concept}」相关问题，保证原有流程可以正常使用。`
    case '优化': return `优化「${concept}」的使用体验，让信息更快、更清楚地呈现。`
    case '重构': return `整理「${concept}」的实现，在保持使用方式不变的前提下降低维护成本。`
    case '补充文档': return `补充「${concept}」的说明，方便使用和交接。`
    case '补充验证': return `补上「${concept}」的自动验证，减少后续回归风险。`
    case '整理': return `整理「${concept}」相关工程，为后续功能迭代留出空间。`
    default: return `本次改动围绕「${concept}」展开，具体范围以提交依据为准。`
  }
}

function evidenceFor(commit: Commit, repoName: string): string {
  const paths = pathsFor(commit)
  const shownPaths = paths.slice(0, 3).join('、')
  const pathSuffix = paths.length > 0
    ? ` · ${shownPaths}${paths.length > 3 ? ` 等 ${paths.length} 个文件` : ''}`
    : ''
  return `${repoName || '未识别仓库'} · ${commit.files} 个文件${pathSuffix} · +${commit.insertions}/−${commit.deletions}`
}

export function summarizeCommit(commit: Commit, repoName = ''): BusinessSummary {
  const rule = ruleFor(commit)
  const action = actionFor(commit)
  const concept = rule?.concept ?? translatedConcept(commit.subject)
  return {
    title: `${action}：${concept}`,
    requirement: rule?.requirement ?? fallbackRequirement(action, concept),
    area: rule?.area ?? (commit.scope ? `代码模块：${commit.scope}` : '代码交付'),
    source: commit.subject,
    evidence: evidenceFor(commit, repoName),
  }
}

export function summarizeBusinessChanges(facts: DayFactsLite, limit?: number): BusinessSummary[] {
  const summaries = facts.git.repos.flatMap((repo) =>
    repo.commits.map((commit) => summarizeCommit(commit, repo.name)))
  return typeof limit === 'number' ? summaries.slice(0, Math.max(0, limit)) : summaries
}

export function businessOverview(summaries: BusinessSummary[]): string {
  if (summaries.length === 0) return '今天没有可归纳的代码交付。'
  const areas = [...new Set(summaries.map((summary) => summary.area))].slice(0, 3)
  return `今天完成 ${summaries.length} 项业务变化，主要涉及${areas.join('、')}。`
}
