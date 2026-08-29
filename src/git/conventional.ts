import { COMMIT_TYPES, type CommitType, type ConventionalParts } from './types'

// 冒号后必须有空格：否则 "see https://x.dev: 说明" 里的 "https" 会被当成 type
const RE = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?: (.+)$/s

const KNOWN = new Set<string>(COMMIT_TYPES)

/**
 * 解析 Conventional Commits 标题。
 * 未知 type 一律降级为 null —— 冒充规范提交比不分类更糟：
 * 「wip: 随手存一下」不该出现在 feat/fix 的统计里。
 */
export function parseConventional(subject: string): ConventionalParts {
  const m = RE.exec(subject)
  if (!m) return { type: null, scope: null, breaking: false, description: subject }

  const type = m[1]!.toLowerCase()
  if (!KNOWN.has(type)) {
    return { type: null, scope: null, breaking: false, description: subject }
  }
  const scope = m[2]?.trim()
  return {
    type: type as CommitType,
    scope: scope ? scope : null,
    breaking: m[3] === '!',
    description: m[4]!,
  }
}
