const { useEffect, useMemo, useState } = React;
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } = window;

// fixture.js 由 scripts/make-prototype-fixture.ts 从真实 scanDay 输出生成。
// 它含真实 session / commit 标题，因此不入库——克隆下来先自己跑一次生成。
const D = window.GOULE_DATA;
if (!D) {
  document.getElementById("root").innerHTML =
    '<div class="boot-hint"><h1>缺少 fixture.js</h1>'
    + '<p>这个原型跑在你自己机器的真实 scanDay 数据上。fixture 含真实标题，不入库。</p>'
    + '<code>bun run scripts/make-prototype-fixture.ts 2026-08-28</code>'
    + '<p class="dim">在仓库根目录执行，然后刷新本页。</p></div>';
  throw new Error("missing fixture.js");
}

// ── 区间运算：图上画什么，数字就是什么 ──────────────────────────────
const MIN = 60000;
const HOUR = 3600000;
const SHORT = 2 * MIN;

const union = list => {
  const sorted = list.map(x => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
};
const subtract = (base, cut) => {
  let rest = base.map(x => [x[0], x[1]]);
  for (const [cs, ce] of cut) {
    const next = [];
    for (const [s, e] of rest) {
      if (ce <= s || cs >= e) { next.push([s, e]); continue; }
      if (s < cs) next.push([s, cs]);
      if (e > ce) next.push([ce, e]);
    }
    rest = next;
  }
  return rest;
};
const intersect = (a, b) => {
  const out = [];
  for (const [s, e] of a) for (const [c, d] of b) {
    const s2 = Math.max(s, c), e2 = Math.min(e, d);
    if (e2 > s2) out.push([s2, e2]);
  }
  return union(out);
};
const total = list => list.reduce((sum, [s, e]) => sum + e - s, 0);

const HAND = union(D.handBlocks);
const AGENT_ALL = union(D.agentBlocks);
const AGENT_ONLY = subtract(AGENT_ALL, HAND);
const OVERLAP = intersect(AGENT_ALL, HAND);

const HAND_MS = total(HAND);
const AGENT_ONLY_MS = total(AGENT_ONLY);
const OVERLAP_MS = total(OVERLAP);
const P90_MS = D.baseline.handsOnP90 * MIN;
const COMMITS = D.git.commits;

// 轴裁到真正有活动的区间，避免整条时间轴三分之二是空的
const AXIS = (() => {
  const marks = [...HAND, ...AGENT_ALL, ...COMMITS.map(c => [c.at, c.at])];
  const lo = Math.min(...marks.map(x => x[0]));
  const hi = Math.max(...marks.map(x => x[1]));
  return { start: Math.floor(lo / HOUR) * HOUR, end: Math.ceil(hi / HOUR) * HOUR };
})();

const HAND_FIRST = Math.min(...HAND.map(x => x[0]));
const HAND_LAST = Math.max(...HAND.map(x => x[1]));

function fmtDur(ms) {
  const m = Math.round(ms / MIN);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
const timeFmt = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtTime = ms => timeFmt.format(new Date(ms));
const fmtInt = n => n.toLocaleString("zh-CN");
/** 大数用紧凑写法，精确值放 title，避免一行里出现 117,299,274 这种读不动的串 */
function fmtCompact(n) {
  if (n < 10000) return fmtInt(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e5 ? 1 : 0)}K`;
  return `${(n / 1e6).toFixed(1)}M`;
}

function Icon({ name }) {
  const paths = {
    tune: <><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></>,
    left: <path d="m15 18-6-6 6-6"/>,
    right: <path d="m9 18 6-6-6-6"/>,
    chevron: <path d="m7 10 5 5 5-5"/>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

// ── 收工刻度 ────────────────────────────────────────────────────────
function Timeline({ emphasis }) {
  const [visible, setVisible] = useState({ hand: true, agent: true, commit: true });
  const [hover, setHover] = useState(null);
  const span = AXIS.end - AXIS.start;
  const pos = ms => ((ms - AXIS.start) / span) * 100;
  const ticks = [];
  for (let t = AXIS.start; t <= AXIS.end; t += HOUR) ticks.push(t);

  const dim = layer => emphasis !== "balanced" && emphasis !== layer;
  const seg = (list, cls, layer, name) => list.map(([s, e], i) => {
    const short = e - s < SHORT;
    const mins = (e - s) / MIN;
    const readable = mins < 1 ? "<1 min" : `${Math.round(mins)} min`;
    return <div key={`${cls}-${i}`}
      className={`seg ${cls} ${short ? "short" : ""} ${dim(layer) ? "dim" : ""}`}
      style={{ left: `${pos(s)}%`, width: short ? undefined : `${pos(e) - pos(s)}%` }}
      onMouseEnter={() => setHover({ x: pos((s + e) / 2), label: `${name} · ${fmtTime(s)}–${fmtTime(e)} · ${readable}` })}
      onMouseLeave={() => setHover(null)}
      aria-label={`${name} ${fmtTime(s)} 到 ${fmtTime(e)}`} />;
  });

  return <section className="section" id="timeline">
    <div className="section-head">
      <div>
        <h2>收工刻度</h2>
        <p className="section-note">{fmtTime(AXIS.start)} – {fmtTime(AXIS.end)}，逻辑日 04:00 → 次日 04:00</p>
      </div>
      <div className="legend">
        <button className={visible.hand ? "" : "off"} onClick={() => setVisible(v => ({ ...v, hand: !v.hand }))}><i className="key hand"/>动手</button>
        <button className={visible.agent ? "" : "off"} onClick={() => setVisible(v => ({ ...v, agent: !v.agent }))}><i className="key agent"/>Agent 独占</button>
        <span className="legend-static"><i className="key overlap"/>与动手重叠</span>
        <button className={visible.commit ? "" : "off"} onClick={() => setVisible(v => ({ ...v, commit: !v.commit }))}><i className="key commit"/>提交</button>
      </div>
    </div>

    <div className="timeline-card">
      <div className="timeline">
        {ticks.map((t, i) => <i key={`g${i}`} className="grid-line" style={{ left: `${pos(t)}%` }}/>)}

        <div className="lane">
          <span className="lane-label hand">动手</span>
          <div className="lane-track">{visible.hand && seg(HAND, "hand", "hand", "动手")}</div>
          <span className="lane-total">{fmtDur(HAND_MS)}</span>
        </div>

        <div className="lane">
          <span className="lane-label agent">Agent</span>
          <div className="lane-track">
            {visible.agent && seg(OVERLAP, "overlap", "agent", "与动手重叠")}
            {visible.agent && seg(AGENT_ONLY, "agent", "agent", "Agent 独占")}
          </div>
          <span className="lane-total">{fmtDur(AGENT_ONLY_MS)}</span>
        </div>

        <div className={`lane ${COMMITS.length ? "" : "lane-off"}`}>
          <span className="lane-label commit">提交</span>
          <div className="lane-track">
            {COMMITS.length === 0 && <span className="lane-empty">当日无提交</span>}
            {visible.commit && COMMITS.map(c =>
              <i key={c.hash} className="commit-mark" style={{ left: `${pos(c.at)}%` }}
                onMouseEnter={() => setHover({ x: pos(c.at), label: `${fmtTime(c.at)} · ${c.hash} · ${c.subject}` })}
                onMouseLeave={() => setHover(null)}
                aria-label={`提交 ${c.hash} ${c.subject}`} />)}
          </div>
          <span className="lane-total">{COMMITS.length || "—"}</span>
        </div>

        <div className="axis">
          {ticks.map((t, i) => <span key={`t${i}`} className="tick" style={{ left: `${pos(t)}%` }}>{fmtTime(t)}</span>)}
        </div>

        {hover && <div className="time-tooltip" style={{ left: `${hover.x}%` }}>{hover.label}</div>}
      </div>

      <p className="timeline-caption">
        实心 = 你的输入证据，条纹 = Agent 在你动手期间同时运行（<strong>不计入 Agent 独占</strong>，共 {fmtDur(OVERLAP_MS)}）。
        菱形是 commit 落点，按 author date 定位。短于 2 分钟的活动以细线标记，不放大成块。
      </p>
    </div>
  </section>;
}

// ── 证据簿：按仓库把 session 与 commit 并到一起 ──────────────────────
function buildGroups() {
  const repos = D.git.repos;
  const repoOf = cwd => {
    if (!cwd) return null;
    let best = null;
    for (const r of repos) {
      if (cwd === r.path || cwd.startsWith(r.path + "/")) {
        if (!best || r.path.length > best.path.length) best = r;
      }
    }
    return best;
  };

  const map = new Map();
  for (const s of D.sessions) {
    const repo = repoOf(s.cwd);
    const key = repo ? repo.path : `loose:${s.cwd ?? "unknown"}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key, repo,
        name: repo ? repo.name : (s.cwd ?? "未知目录"),
        path: repo ? repo.path : s.cwd,
        branches: new Set(),
        sessions: [], minutes: 0, output: 0,
        commits: repo ? COMMITS.filter(c => c.repoName === repo.name) : [],
      };
      map.set(key, g);
    }
    if (s.branch) g.branches.add(s.branch);
    g.sessions.push(s);
    g.minutes += s.minutes;
    g.output += s.tokens.output;
  }
  return [...map.values()].sort((a, b) =>
    b.commits.length - a.commits.length || b.minutes - a.minutes);
}
const GROUPS = buildGroups();

function CommitRow({ c }) {
  return <div className="commit-row">
    <code className="commit-hash">{c.hash}</code>
    {c.type && <span className="commit-type">{c.type}{c.scope ? `(${c.scope})` : ""}</span>}
    <span className="commit-subject">{c.description || c.subject}</span>
    <span className="commit-stat">
      <span className="add">+{c.insertions}</span><span className="del">−{c.deletions}</span>
    </span>
    <span className="commit-time">{fmtTime(c.at)}</span>
    {c.copies > 0 && <span className="commit-copy" title="同一提交被 cherry-pick 到别的分支，已合并为一条">+{c.copies} 副本</span>}
  </div>;
}

function SessionRow({ s }) {
  const t = s.tokens;
  return <div className="session-row">
    <span className="session-tool">{s.tool === "claude-code" ? "CC" : "CX"}</span>
    <span className="session-title">
      {s.title || <em className="empty-note">无标题（Codex 不提供，留空不编造）</em>}
      {s.isSidechain && <span className="session-tag">subagent</span>}
    </span>
    <span className="session-min">{s.minutes >= 1 ? fmtDur(s.minutes * MIN) : (s.minutes > 0 ? "<1m" : "—")}</span>
    <span className="session-out" title={`输出 ${fmtInt(t.output)} tokens`}>{fmtCompact(t.output)}</span>
  </div>;
}

function Ledger() {
  const [open, setOpen] = useState(GROUPS.length ? GROUPS[0].key : null);
  const max = Math.max(1, ...GROUPS.map(g => g.minutes));
  return <section className="section" id="evidence">
    <div className="section-head">
      <div>
        <h2>证据簿</h2>
        <p className="section-note">按仓库归组，session 与 commit 并列。会话时长可重叠，合计是上界</p>
      </div>
      <div className="legend legend-static">
        {D.git.repos.length} 个仓库 · {COMMITS.length} 次提交 · {D.git.insertions + D.git.deletions} 行改动
      </div>
    </div>

    <div className="ledger">
      {GROUPS.map((g, i) => {
        const isOpen = open === g.key;
        return <div className={`ledger-row ${isOpen ? "open" : ""}`} key={g.key}>
          <button className="ledger-summary" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen}>
            <span className="project-index">{String(i + 1).padStart(2, "0")}</span>
            <span className="project-main">
              <span className="project-name">
                {g.name}
                {!g.repo && <span className="session-tag">非 git 仓库</span>}
              </span>
              <span className="project-meta">
                <span>{[...g.branches].join(" / ") || (g.repo && g.repo.branch) || "未识别分支"}</span>
                <span>{g.sessions.length} sessions</span>
                {g.commits.length > 0 && <span>{g.commits.length} commits</span>}
                <span>输出 {fmtCompact(g.output)} tokens</span>
              </span>
            </span>
            <span className="project-share"><i style={{ width: `${(g.minutes / max) * 100}%` }}/></span>
            <span className="project-time">{fmtDur(g.minutes * MIN)}</span>
            <span className="chevron"><Icon name="chevron"/></span>
          </button>

          {isOpen && <div className="ledger-detail">
            <div className="detail-block">
              <div className="detail-label">会话 · 标题与输出 tokens</div>
              <div className="session-list">{g.sessions.map(s => <SessionRow key={s.id} s={s}/>)}</div>
            </div>
            <div className="detail-block">
              <div className="detail-label">提交</div>
              {g.commits.length
                ? <div className="commit-list">{g.commits.map(c => <CommitRow key={c.hash} c={c}/>)}</div>
                : <span className="empty-note">
                    {g.repo ? "这个仓库当日没有你的提交。" : "不是 git 仓库，没有提交可关联。"}
                  </span>}
            </div>
          </div>}
        </div>;
      })}
    </div>
  </section>;
}

// ── Token 用量 ──────────────────────────────────────────────────────
function Tokens() {
  const t = D.tokens;
  const uncached = D.tokenSummary.uncachedInput;
  const hit = t.cacheRead / (uncached + t.cacheRead);
  return <section className="panel" id="tokens">
    <h3>Token 用量</h3>
    <div className="stat-lead">
      <span className="stat-value">{fmtInt(t.output)}</span>
      <span className="stat-unit">输出 tokens</span>
    </div>
    <p className="panel-note">其中推理 {fmtCompact(t.reasoning)}。这是当天真正被生成出来的量。</p>
    <div className="bar-row">
      <div className="bar"><i style={{ width: `${hit * 100}%` }}/></div>
      <span className="bar-label">缓存命中 {(hit * 100).toFixed(0)}%</span>
    </div>
    <dl className="kv">
      <div><dt>未命中缓存输入</dt><dd title={fmtInt(uncached)}>{fmtCompact(uncached)}</dd></div>
      <div><dt>缓存读取</dt><dd title={fmtInt(t.cacheRead)}>{fmtCompact(t.cacheRead)}</dd></div>
    </dl>
    <p className="panel-caveat">
      输入量不代表「你写了多少」：每一轮都要重发上下文，没命中缓存的部分会反复计入。
      口径按事件时间归属到当日，不是把整份 session 文件记到今天。
    </p>
  </section>;
}

// ── 鼠标点击 ────────────────────────────────────────────────────────
const COVERAGE_LABEL = { complete: "完整", partial: "部分", unavailable: "不可用" };

function Mouse() {
  const m = D.mouse;
  const max = Math.max(1, ...m.byHour);
  return <section className="panel" id="mouse">
    <h3>鼠标点击</h3>
    {m.enabled ? <>
      <div className="stat-lead">
        <span className="stat-value">{fmtInt(m.clicks)}</span>
        <span className="stat-unit">次点击</span>
      </div>
      <p className="panel-note">
        采集 {fmtDur(m.observedMinutes * MIN)} · {m.provider} · 覆盖 {COVERAGE_LABEL[m.coverage]}
      </p>
      <div className="hour-bars" role="img" aria-label="按小时的点击分布">
        {m.byHour.map((v, h) => <i key={h} style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
          title={`${String(h).padStart(2, "0")}:00 · ${v} 次`}/>)}
      </div>
      <div className="hour-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </> : <>
      <div className="stat-lead off"><span className="stat-value">未开启</span></div>
      <p className="panel-note">默认关闭。开启后只保存按小时聚合的点击次数，不记录坐标、窗口名或应用名。</p>
      <code className="cmd">goule activity start</code>
    </>}
    <p className="panel-caveat">
      点击数是独立活动证据，<strong>不计入动手时长</strong>，也不参与压力信号。
    </p>
  </section>;
}

// ── 恢复信号 ────────────────────────────────────────────────────────
const SIGNAL_META = {
  late_night: { label: "夜间活动", unit: "m" },
  past_midnight: { label: "跨过午夜", unit: "bool" },
  short_recovery: { label: "距上次活动", unit: "h", lowerIsWorse: true },
  consecutive_days: { label: "连续活跃", unit: "d" },
  overlong_day: { label: "超长工作日", unit: "m" },
  weekend_work: { label: "周末工作", unit: "m" },
  no_break_block: { label: "无休息连续块", unit: "m" },
};
const fmtSignal = (v, unit) => {
  if (unit === "bool") return v ? "是" : "否";
  if (unit === "h") return `${v.toFixed(1)}h`;
  if (unit === "d") return `${Math.round(v)}d`;
  return `${Math.round(v)}m`;
};

function Recovery() {
  const fired = D.signals.filter(s => s.fired);
  return <section className="section" id="recovery">
    <div className="section-head">
      <div>
        <h2>今天的恢复信号</h2>
        <p className="section-note">
          {fired.length === 0
            ? `${D.signals.length} 项信号全部未触发。只陈述观测事实，不打分。`
            : `${D.signals.length} 项中触发了 ${fired.length} 项。压力债 ${D.debt.toFixed(2)}。`}
        </p>
      </div>
    </div>
    <div className="signals">
      {D.signals.map(s => {
        const meta = SIGNAL_META[s.id] || { label: s.id, unit: "m" };
        return <div className={`signal ${s.fired ? "fired" : ""}`} key={s.id}>
          <span className="signal-name">{meta.label}</span>
          <span className="signal-value">{fmtSignal(s.value, meta.unit)}</span>
          <span className="signal-threshold">
            {meta.lowerIsWorse ? "低于" : "超过"} {fmtSignal(s.threshold, meta.unit)} 触发
          </span>
        </div>;
      })}
    </div>
  </section>;
}

// ── 日报 ────────────────────────────────────────────────────────────
const reportText = [
  `# ${D.dayId} · 开发活动日报`,
  ``,
  `## 今日事实`,
  `- 动手活动：${fmtDur(HAND_MS)}`,
  `- Agent 独占运行：${fmtDur(AGENT_ONLY_MS)}（另有 ${fmtDur(OVERLAP_MS)} 与动手重叠，不计入）`,
  `- 有效会话：${D.sessions.length}`,
  `- 输出 tokens：${fmtInt(D.tokens.output)}`,
  `- 30 天动手 P90：${fmtDur(P90_MS)}`,
  ``,
  `## 提交`,
  ...(COMMITS.length
    ? COMMITS.map(c => `- \`${c.hash}\` ${c.subject} (+${c.insertions}/−${c.deletions})`)
    : [`- 当日无提交`]),
  ``,
  `## 主要证据`,
  ...GROUPS.map(g => `- ${g.name} · ${[...g.branches].join(" / ") || "未识别分支"} · ${g.sessions.length} sessions · ${g.commits.length} commits`),
  ``,
  `> 事实层 · 未启用规则判断`,
].join("\n");

function Report({ onCopy, copied }) {
  const allQuiet = D.signals.every(s => !s.fired);
  return <div className="report-wrap">
    <div className="report-tools">
      <span>与核验页同一份本地扫描数据</span>
      <button className="copy-btn" onClick={onCopy}>{copied ? "已复制" : "复制 Markdown"}</button>
    </div>
    <article className="report-paper">
      <div className="report-meta">GOULE DAILY · {D.dayId}</div>
      <h2>开发活动日报</h2>
      <p>今天动手 {fmtDur(HAND_MS)}，分布在 {fmtTime(HAND_FIRST)} 到 {fmtTime(HAND_LAST)} 之间。</p>
      <hr className="report-rule"/>
      <h3>今日事实</h3>
      <ul>
        <li>动手活动：<code>{fmtDur(HAND_MS)}</code></li>
        <li>Agent 独占运行：<code>{fmtDur(AGENT_ONLY_MS)}</code>（另有 <code>{fmtDur(OVERLAP_MS)}</code> 与动手重叠，不计入）</li>
        <li>有效会话：<code>{D.sessions.length}</code></li>
        <li>输出 tokens：<code>{fmtInt(D.tokens.output)}</code></li>
        <li>30 天动手 P90：<code>{fmtDur(P90_MS)}</code></li>
      </ul>
      <h3>提交</h3>
      {COMMITS.length
        ? <ul>{COMMITS.map(c =>
            <li key={c.hash}><code>{c.hash}</code> {c.subject} <span className="report-dim">(+{c.insertions}/−{c.deletions})</span></li>)}
          </ul>
        : <p>当日无提交。</p>}
      <h3>主要证据</h3>
      <ul>{GROUPS.map(g =>
        <li key={g.key}><code>{g.name}</code> · {[...g.branches].join(" / ") || "未识别分支"} · {g.sessions.length} sessions · {g.commits.length} commits</li>)}
      </ul>
      <div className="report-callout">
        <strong>{allQuiet ? "今天没有触发恢复信号。" : "今天有恢复信号触发。"}</strong>
        <p>{allQuiet
          ? `${D.signals.length} 项信号全部在阈值内。`
          : D.signals.filter(s => s.fired).map(s => (SIGNAL_META[s.id] || {}).label || s.id).join("、")}</p>
      </div>
      <hr className="report-rule"/>
      <div className="report-meta">事实层 · 未启用规则判断</div>
    </article>
  </div>;
}

// ── 首屏 ────────────────────────────────────────────────────────────
function Hero() {
  const top = GROUPS[0];
  const ratio = Math.min(1, HAND_MS / P90_MS) * 100;
  return <section className="hero">
    <div className="hero-main">
      <h1>今天动手 <b>{fmtDur(HAND_MS)}</b></h1>
      <p className="hero-sub">
        {fmtTime(HAND_FIRST)} – {fmtTime(HAND_LAST)} · {D.sessions.length} 个会话
        {COMMITS.length > 0 ? ` · ${COMMITS.length} 次提交` : ""}
        {top ? ` · 主要在 ${top.name}` : ""}
      </p>
      <div className="baseline">
        <div className="baseline-track"><i style={{ width: `${ratio}%` }}/></div>
        <div className="baseline-legend">
          <span>今天 {fmtDur(HAND_MS)}</span>
          <span>你 30 天的 P90 是 {fmtDur(P90_MS)}</span>
        </div>
      </div>
    </div>
    <div className="hero-aside">
      <div className="aside-row">
        <span className="aside-label">Agent 独占运行</span>
        <span className="aside-value">{fmtDur(AGENT_ONLY_MS)}</span>
        <span className="aside-note">产出杠杆的证据，不是工时，不与上面相加</span>
      </div>
      <div className="aside-row">
        <span className="aside-label">输出 tokens</span>
        <span className="aside-value">{fmtCompact(D.tokens.output)}</span>
        <span className="aside-note">当天生成量，按事件时间归属</span>
      </div>
    </div>
  </section>;
}

function App() {
  const [view, setView] = useState("verify");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const palette = PALETTES[t.palette[0]] || PALETTES["#62D6A7"];
  const theme = THEMES[t.theme] || THEMES.night;
  const cssVars = {
    "--mint": palette.mint,
    "--amber": palette.amber,
    ...(t.theme === "night" ? { "--night": palette.night } : {}),
    ...Object.fromEntries(Object.entries(theme).map(([key, value]) => [`--${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`, value]))
  };
  const flash = msg => { setToast(msg); window.clearTimeout(window.__gouleToast); window.__gouleToast = window.setTimeout(() => setToast(""), 1800); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(reportText); setCopied(true); flash("日报 Markdown 已复制"); window.setTimeout(() => setCopied(false), 1800); }
    catch { flash("浏览器未开放剪贴板权限"); }
  };
  const activateStyle = () => window.postMessage({ type: "miaoda:tweaks:activate" }, "*");
  useEffect(() => {
    const key = e => {
      if (/input|textarea/i.test(e.target.tagName)) return;
      if (e.key.toLowerCase() === "r") setView(v => v === "verify" ? "report" : "verify");
      if (e.key.toLowerCase() === "c") copy();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const dateLabel = D.dayId.replace(/-/g, ".");
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date(D.boundary.start));

  return <div className={`app density-${t.density} theme-${t.theme}`} style={cssVars}>
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" fill="none"><path d="M7 5h18v18l-5 5H7V5Z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 11h8M12 16h5M20 23v5" stroke="currentColor" strokeWidth="1.5"/></svg>
        <strong>Goule</strong>
      </div>
      <div className="date-nav">
        <button className="icon-btn" onClick={() => flash(`原型只装载 ${D.dayId} 的数据`)} aria-label="前一天"><Icon name="left"/></button>
        <span className="date-label"><strong>{dateLabel}</strong><span>{weekday}</span></span>
        <button className="icon-btn" disabled aria-label="后一天"><Icon name="right"/></button>
      </div>
      <div className="topbar-right">
        <div className="mode-switch" role="tablist">
          <button className={`mode-tab ${view === "verify" ? "active" : ""}`} onClick={() => setView("verify")}>核验</button>
          <button className={`mode-tab ${view === "report" ? "active" : ""}`} onClick={() => setView("report")}>日报</button>
        </div>
        <button className="icon-btn ghost" onClick={activateStyle} aria-label="调整风格"><Icon name="tune"/></button>
      </div>
    </header>

    <main className="main"><div className="main-inner">
      {view === "verify"
        ? <>
            <Hero/>
            <Timeline emphasis={t.timelineEmphasis}/>
            <Ledger/>
            <div className="panel-row"><Tokens/><Mouse/></div>
            <Recovery/>
          </>
        : <Report onCopy={copy} copied={copied}/>}
    </div></main>

    <footer className="page-foot"><div className="main-inner">
      <span><i className="state-dot"/>本地数据已核验 · 无遥测</span>
      <span>事实层 · 未启用规则判断：无评分、无效率结论、无虚构提交记录</span>
      <code>{D.dayId} · scanDay</code>
    </div></footer>

    <TweaksPanel title="Dusk Ledger">
      <TweakSection label="Atmosphere"/>
      <TweakRadio label="底色" value={t.theme} options={[{value:"pure",label:"纯白"},{value:"cafe",label:"Vibe 灰"},{value:"warm",label:"暖纸"},{value:"night",label:"深夜"}]}
        onChange={v => setTweak(v === "cafe" ? { theme: v, palette: ["#F99C00","#00A873","#F3F4F6"] } : { theme: v })}/>
      <TweakColor label="强调色" value={t.palette}
        options={[["#0A6B4E","#E08A1E","#FFFFFF"],["#F99C00","#00A873","#F3F4F6"],["#62D6A7","#F4B65F","#0D141C"],["#F0A96B","#E9CF82","#17120F"]]}
        onChange={v => setTweak("palette", v)}/>
      <TweakSection label="Layout"/>
      <TweakRadio label="信息密度" value={t.density} options={[{value:"compact",label:"紧凑"},{value:"comfortable",label:"舒展"}]} onChange={v => setTweak("density", v)}/>
      <TweakSection label="Timeline"/>
      <TweakRadio label="视觉重心" value={t.timelineEmphasis} options={[{value:"hand",label:"动手"},{value:"balanced",label:"平衡"},{value:"agent",label:"Agent"}]} onChange={v => setTweak("timelineEmphasis", v)}/>
    </TweaksPanel>

    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

const PALETTES = {
  "#0A6B4E": { mint: "#0A6B4E", amber: "#E08A1E", night: "#FFFFFF" },
  "#187A55": { mint: "#0A6B4E", amber: "#E08A1E", night: "#FFFFFF" },
  "#F99C00": { mint: "#F99C00", amber: "#00A873", night: "#F3F4F6" },
  "#62D6A7": { mint: "#62D6A7", amber: "#F4B65F", night: "#0D141C" },
  "#7FB8FF": { mint: "#7FB8FF", amber: "#B7A2F6", night: "#0B1320" },
  "#F0A96B": { mint: "#B86F2F", amber: "#C6923F", night: "#17120F" }
};

const THEMES = {
  night: {},
  pure: { night: "#FFFFFF", surface: "#FFFFFF", surface2: "#F5F6F4", paper: "#171A18", muted: "#68716B" },
  cafe: { night: "#F3F4F6", surface: "#FFFFFF", surface2: "#E2E3E7", paper: "#18181B", muted: "#52525B" },
  warm: { night: "#EEE8DC", surface: "#F8F4EB", surface2: "#E7DFD1", paper: "#28322D", muted: "#6D776F" }
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
