import type { DayFactsLite } from '../scan'
import { businessOverview, summarizeBusinessChanges } from './business'
import { formatMinutes } from './view'

function commitLabel(commit: DayFactsLite['git']['repos'][number]['commits'][number]): string {
  // subject 已经包含原始 commit message；type/scope 是结构化字段，避免再次拼接导致重复。
  return commit.subject
}

/** 事实层 Markdown：只呈现可追溯数据，不生成 verdict 或模型文案。 */
export function renderReport(facts: DayFactsLite): string {
  const business = summarizeBusinessChanges(facts)
  const lines: string[] = [
    `# ${facts.dayId} 工作日报`,
    '',
    '## 今天做了什么',
    ''
  ]

  if (business.length > 0) {
    lines.push(`> ${businessOverview(business)}`, '')
    for (const item of business) {
      lines.push(`- **${item.title}**`)
      lines.push(`  - 需求：${item.requirement}`)
      lines.push(`  - 代码依据：\`${item.source}\`（${item.evidence}）`)
    }
  } else {
    const titled = facts.sessions.filter((session) => session.title?.trim()).slice(0, 8)
    if (titled.length > 0) {
      for (const session of titled) lines.push(`- 进行中：${session.title!.trim()}（${session.branch ?? '未识别分支'} · ${formatMinutes(session.minutes)}）`)
    } else {
      lines.push(`- 今天没有可识别的交付项；${facts.sessions.length} 个 session 已保留在辅助信息中。`)
    }
  }

  lines.push(
    '',
    '## 交付概览',
    '',
    `- Git commit：${facts.git.totals.commits} 个，${facts.git.totals.files} 个文件，+${facts.git.totals.insertions}/-${facts.git.totals.deletions}`,
    `- 涉及仓库：${facts.git.repos.length} 个`,
    '',
    '## 今日事实',
    '',
    `- 真人投入：${formatMinutes(facts.activity.handsOn.minutes)}`,
    `- Agent 活动：${formatMinutes(facts.activity.agent.minutes)}`,
    `- AI session：${facts.sessions.length} 个`,
    '',
    '## Git 总结',
    ''
  )

  if (facts.git.repos.length === 0) {
    lines.push('今日没有发现已配置仓库的 commit。', '')
  } else {
    for (const repo of facts.git.repos) {
      lines.push(`### ${repo.name} / ${repo.branch}`, '')
      if (repo.commits.length === 0) {
        lines.push('今日没有 commit。', '')
        continue
      }
      for (const commit of repo.commits) {
        const stat = `${commit.files} 文件，+${commit.insertions}/-${commit.deletions}`
        lines.push(`- \`${commit.sha.slice(0, 8)}\` ${commitLabel(commit)}（${stat}）`)
      }
      lines.push('')
    }
  }

  lines.push('## Session 关联', '')
  if (facts.joined.length === 0) {
    lines.push('今日没有成功关联的 session。', '')
  } else {
    for (const joined of facts.joined) {
      const sessions = joined.sessionIds.length === 1 ? '1 个 session' : `${joined.sessionIds.length} 个 session`
      const commits = joined.commitShas.length === 1 ? '1 个 commit' : `${joined.commitShas.length} 个 commit`
      lines.push(`- **${joined.repo}/${joined.branch ?? 'unknown'}**：${sessions}（${formatMinutes(joined.minutes)}）→ ${commits}，${joined.confidence}`)
    }
    lines.push('')
  }

  if (facts.unattributed.sessions.length > 0 || facts.unattributed.commits.length > 0) {
    lines.push('## 未关联项', '')
    if (facts.unattributed.sessions.length > 0) {
      lines.push(`- 未关联 session：${facts.unattributed.sessions.length} 个`)
    }
    if (facts.unattributed.commits.length > 0) {
      lines.push(`- 未关联 commit：${facts.unattributed.commits.length} 个`)
    }
    lines.push('')
  }

  lines.push('## 压力信号', '')
  const fired = facts.stress.signals.filter((signal) => signal.fired)
  if (fired.length === 0) lines.push('今日没有触发压力信号。')
  else for (const signal of fired) lines.push(`- ${signal.id}（${signal.value}，阈值 ${signal.threshold}）`)
  lines.push('')

  if (facts.activity.mouseClicks.enabled || facts.activity.mouseClicks.clicks > 0) {
    lines.push(`> 鼠标点击参考：${facts.activity.mouseClicks.clicks} 次（不计入工作时长；覆盖 ${facts.activity.mouseClicks.coverage}）`, '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}
