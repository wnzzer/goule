import type { DayFactsLite } from '../scan'
import {
  dayFactsMouse,
  escapeHtml,
  formatMinutes,
  hourMax,
  hourValues,
  titleForSession,
  topCommits,
} from './view'

function signalLabel(id: string): string {
  const labels: Record<string, string> = {
    late_night: '深夜工作',
    past_midnight: '跨过午夜',
    short_recovery: '恢复时间不足',
    consecutive_days: '连续工作',
    overlong_day: '超过个人基线',
    weekend_work: '周末工作',
    no_break_block: '连续工作过久',
  }
  return labels[id] ?? id
}

function metric(label: string, value: string, tone: string, detail = ''): string {
  return `<div class="metric metric-${tone}"><span class="metric-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`
}

function renderHours(facts: DayFactsLite): string {
  const values = hourValues(facts)
  const max = hourMax(values)
  return `<div class="hours" role="img" aria-label="按本地小时统计的真人投入">
    ${values.map((value, hour) => `<div class="hour-col"><div class="hour-bar" style="height:${Math.max(4, Math.round((value / max) * 100))}%" title="${hour}:00 · ${value.toFixed(1)} 分钟"></div><span>${String(hour).padStart(2, '0')}</span></div>`).join('')}
  </div>`
}

function renderGit(facts: DayFactsLite): string {
  if (facts.git.repos.length === 0) return '<div class="empty">今天没有发现已配置仓库的 commit。</div>'
  return facts.git.repos.map((repo) => `<article class="repo-card">
    <div class="repo-heading"><div><span class="eyebrow">REPOSITORY</span><h3>${escapeHtml(repo.name)}</h3></div><span class="branch">${escapeHtml(repo.branch)}</span></div>
    ${repo.commits.length === 0 ? '<p class="muted">今日没有 commit。</p>' : `<div class="commit-list">${repo.commits.map((commit) => `<div class="commit-row"><span class="commit-type ${commit.type ? `type-${escapeHtml(commit.type)}` : ''}">${escapeHtml(commit.type ?? 'commit')}</span><div class="commit-main"><strong>${escapeHtml(commit.subject)}</strong><small><code>${escapeHtml(commit.sha.slice(0, 8))}</code> · ${commit.files} 文件 · +${commit.insertions}/-${commit.deletions}</small></div></div>`).join('')}</div>`}
  </article>`).join('')
}

function renderSessions(facts: DayFactsLite): string {
  if (facts.sessions.length === 0) return '<div class="empty">今天没有发现 AI session。</div>'
  return `<div class="session-grid">${facts.sessions.map((session) => `<article class="session-card">
    <div class="session-top"><span class="tool-badge">${escapeHtml(session.tool)}</span>${session.isSidechain ? '<span class="sidechain">subagent</span>' : ''}</div>
    <h3>${escapeHtml(titleForSession(session))}</h3>
    <p class="session-meta">${escapeHtml(session.branch ?? '未识别分支')} · ${escapeHtml(formatMinutes(session.minutes))}</p>
    <small class="session-id"><code>${escapeHtml(session.id)}</code></small>
  </article>`).join('')}</div>`
}

function renderJoined(facts: DayFactsLite): string {
  if (facts.joined.length === 0) return '<div class="empty">暂无成功关联的 session。</div>'
  return `<div class="joined-list">${facts.joined.map((item) => `<div class="joined-row"><div><strong>${escapeHtml(item.repo)}</strong><span>${escapeHtml(item.branch ?? 'unknown')}</span></div><div class="joined-flow"><span>${item.sessionIds.length} session · ${escapeHtml(formatMinutes(item.minutes))}</span><b>→</b><span>${item.commitShas.length} commit</span></div><span class="confidence confidence-${item.confidence}">${item.confidence}</span></div>`).join('')}</div>`
}

function renderStress(facts: DayFactsLite): string {
  const fired = facts.stress.signals.filter((signal) => signal.fired)
  if (fired.length === 0) return '<div class="calm"><span class="calm-icon">✓</span><div><strong>今天没有触发压力信号</strong><p>保持这个节奏，记得给自己留出恢复时间。</p></div></div>'
  return `<div class="stress-list">${fired.map((signal) => `<div class="stress-row"><span class="stress-dot"></span><div><strong>${escapeHtml(signalLabel(signal.id))}</strong><small>观测值 ${escapeHtml(signal.value)} · 阈值 ${escapeHtml(signal.threshold)}</small></div></div>`).join('')}</div>`
}

/** 可独立打开、可打印为 PDF 的本地日报页面。所有数据内嵌，不依赖网络资源。 */
export function renderHtmlReport(facts: DayFactsLite): string {
  const mouse = dayFactsMouse(facts)
  const top = topCommits(facts, 3)
  const unattributed = facts.unattributed.sessions.length + facts.unattributed.commits.length
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(facts.dayId)} · Goule 工作日报</title>
<style>
:root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#e7eaf0;--bg:#f4f6fa;--card:#fff;--blue:#4169e1;--violet:#7c5cff;--green:#159570;--amber:#c97809;--red:#d14d5c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.5}main{max-width:1120px;margin:0 auto;padding:42px 28px 70px}.hero{position:relative;overflow:hidden;padding:38px 40px;border-radius:28px;background:linear-gradient(120deg,#1c2550 0%,#344ca6 55%,#7258dc 100%);color:#fff;box-shadow:0 18px 45px #27346d33}.hero:after{content:"";position:absolute;width:310px;height:310px;right:-80px;top:-140px;border-radius:50%;background:#ffffff1c}.hero .eyebrow{color:#cad4ff}.eyebrow{font-size:11px;letter-spacing:.16em;font-weight:700;color:var(--muted)}h1{font-size:38px;letter-spacing:-.04em;margin:8px 0 6px;line-height:1.15}h2{font-size:22px;margin:0 0 18px;letter-spacing:-.02em}h3{font-size:16px;margin:4px 0}.subtitle{color:#d9e0ff;margin:0}.hero-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.pill{border:1px solid #ffffff40;background:#ffffff16;padding:6px 11px;border-radius:99px;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0}.metric{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px;box-shadow:0 6px 18px #26334d08}.metric-label{display:block;color:var(--muted);font-size:12px;margin-bottom:8px}.metric strong{font-size:26px;letter-spacing:-.04em;display:block}.metric small{display:block;color:var(--muted);font-size:11px;margin-top:5px}.metric-blue strong{color:var(--blue)}.metric-violet strong{color:var(--violet)}.metric-green strong{color:var(--green)}.metric-amber strong{color:var(--amber)}section{margin-top:22px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:25px 27px;box-shadow:0 6px 18px #26334d08}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:18px}.section-head p{margin:0;color:var(--muted);font-size:12px}.hours{height:155px;display:flex;align-items:end;gap:8px;padding:0 2px 22px;border-bottom:1px solid var(--line)}.hour-col{flex:1;height:100%;display:flex;align-items:end;justify-content:end;flex-direction:column;gap:7px}.hour-col span{font-size:10px;color:var(--muted)}.hour-bar{width:100%;min-height:4px;border-radius:7px 7px 2px 2px;background:linear-gradient(180deg,#6c7ff3,#4657cf);transition:height .2s}.repo-card{border:1px solid var(--line);border-radius:16px;padding:17px 18px;margin-top:12px}.repo-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}.repo-heading h3{font-size:18px}.branch{background:#f0f2ff;color:#4e5ac8;border-radius:999px;padding:5px 10px;font-size:11px;white-space:nowrap}.commit-row{display:flex;gap:12px;padding:13px 0;border-top:1px solid var(--line);align-items:start}.commit-row:first-child{margin-top:12px}.commit-type{font-size:10px;min-width:58px;text-align:center;padding:4px 7px;border-radius:6px;background:#eef1f7;color:var(--muted);font-weight:700;text-transform:uppercase}.type-feat{background:#e7f8f0;color:var(--green)}.type-fix{background:#fff0ed;color:#ca4a45}.type-refactor,.type-perf{background:#eeeaff;color:#6f54d8}.commit-main{min-width:0}.commit-main strong{display:block;font-size:14px;overflow-wrap:anywhere}.commit-main small{display:block;color:var(--muted);font-size:11px;margin-top:4px}.session-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.session-card{border:1px solid var(--line);border-radius:16px;padding:17px;min-width:0}.session-top{display:flex;justify-content:space-between;align-items:center}.tool-badge{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#4e5ac8;background:#eef1ff;border-radius:999px;padding:5px 8px}.sidechain{font-size:10px;color:var(--muted)}.session-card h3{margin-top:15px;overflow-wrap:anywhere}.session-meta{font-size:12px;color:var(--muted);margin:7px 0}.session-id{font-size:10px;color:#98a0b3}.joined-row{display:grid;grid-template-columns:1.1fr 1.4fr auto;align-items:center;gap:15px;padding:14px 0;border-top:1px solid var(--line)}.joined-row:first-child{border-top:0}.joined-row strong{display:block}.joined-row>div:first-child span{font-size:11px;color:var(--muted)}.joined-flow{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px}.joined-flow b{color:#a5adba}.confidence{font-size:10px;font-weight:700;padding:5px 8px;border-radius:6px}.confidence-exact{background:#e7f8f0;color:var(--green)}.confidence-heuristic{background:#fff4dd;color:var(--amber)}.stress-row{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.stress-row:first-child{border-top:0}.stress-dot{width:9px;height:9px;border-radius:50%;background:var(--amber);box-shadow:0 0 0 5px #fff3de}.stress-row strong,.stress-row small{display:block}.stress-row small{font-size:11px;color:var(--muted);margin-top:3px}.calm{display:flex;align-items:center;gap:14px;background:#eefaf5;border-radius:14px;padding:15px 17px;color:#167458}.calm-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#c8efdf;font-weight:800}.calm p{margin:3px 0 0;color:#4e8977;font-size:12px}.evidence{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.evidence-card{padding:16px;border-radius:15px;background:#f7f8fb;border:1px solid var(--line)}.evidence-card strong{display:block;font-size:13px;line-height:1.45}.evidence-card small{display:block;color:var(--muted);font-size:11px;margin-top:7px}.empty{padding:15px 0;color:var(--muted);font-size:13px}.muted{color:var(--muted);font-size:13px}.footer{text-align:center;color:#9aa3b5;font-size:11px;margin-top:28px}.print-only{display:none}@media(max-width:760px){main{padding:20px 14px 50px}.hero{padding:28px 24px;border-radius:22px}h1{font-size:30px}.metrics{grid-template-columns:repeat(2,1fr)}.session-grid,.evidence{grid-template-columns:1fr}.joined-row{grid-template-columns:1fr;gap:7px}.joined-flow{flex-wrap:wrap}.section{padding:20px}.hours{gap:3px}}
@media print{body{background:#fff}main{max-width:none;padding:0}.hero,section,.metric{box-shadow:none}.hero{break-inside:avoid}section{break-inside:avoid;margin-top:14px}.print-only{display:block}.no-print{display:none}}
</style>
</head>
<body><main>
<header class="hero"><span class="eyebrow">GOULE · ENOUGH, CLOCK OUT</span><h1>${escapeHtml(facts.dayId)} 工作日报</h1><p class="subtitle">事实层证据 · 本地生成 · 不含对话正文</p><div class="hero-meta"><span class="pill">${escapeHtml(facts.boundary.tz)}</span><span class="pill">逻辑日 ${facts.boundary.cutoffHour}:00 起</span><span class="pill">生成于 ${escapeHtml(new Date(facts.generatedAt).toLocaleString('zh-CN'))}</span></div></header>
<div class="metrics">
${metric('真人投入', formatMinutes(facts.activity.handsOn.minutes), 'blue', '唯一工时口径')}
${metric('Agent 活动', formatMinutes(facts.activity.agent.minutes), 'violet', '独立产出证据')}
${metric('Git commits', `${facts.git.totals.commits} 个`, 'green', `+${facts.git.totals.insertions}/-${facts.git.totals.deletions}`)}
${metric('鼠标点击', mouse.enabled || mouse.clicks > 0 ? `${mouse.clicks} 次` : '未启用', 'amber', mouse.enabled ? `覆盖 ${mouse.coverage}` : '可选活动证据')}
</div>
<section><div class="section-head"><div><span class="eyebrow">ACTIVITY RHYTHM</span><h2>真人投入时段</h2></div><p>按本地小时聚合 · 不记录内容</p></div>${renderHours(facts)}</section>
<section><div class="section-head"><div><span class="eyebrow">DELIVERABLES</span><h2>Git 总结</h2></div><p>${facts.git.repos.length} 个仓库 · ${facts.git.totals.files} 个文件</p></div>${renderGit(facts)}</section>
<section><div class="section-head"><div><span class="eyebrow">AI WORKFLOW</span><h2>AI Session</h2></div><p>${facts.sessions.length} 个 session</p></div>${renderSessions(facts)}</section>
<section><div class="section-head"><div><span class="eyebrow">TRACEABILITY</span><h2>Session 关联成果</h2></div><p>exact 优先，heuristic 明示</p></div>${renderJoined(facts)}</section>
<section><div class="section-head"><div><span class="eyebrow">RECOVERY</span><h2>压力信号</h2></div><p>压力是下班理由，不是额外 KPI</p></div>${renderStress(facts)}</section>
${top.length > 0 ? `<section><div class="section-head"><div><span class="eyebrow">EVIDENCE</span><h2>今日证据卡</h2></div><p>可复制到日报或周报</p></div><div class="evidence">${top.map((commit) => `<div class="evidence-card"><strong>${escapeHtml(commit.subject)}</strong><small>${escapeHtml(commit.type ?? 'commit')} · +${commit.insertions}/-${commit.deletions}</small></div>`).join('')}</div></section>` : ''}
${unattributed > 0 ? `<section><div class="section-head"><div><span class="eyebrow">TRANSPARENCY</span><h2>未关联项</h2></div></div><p class="muted">${facts.unattributed.sessions.length} 个 session、${facts.unattributed.commits.length} 个 commit 未能关联到明确的工作流，已保留在事实层中。</p></section>` : ''}
<footer class="footer">Goule · Enough, clock out. · 本报告由本地事实数据生成</footer>
</main></body></html>`
}

