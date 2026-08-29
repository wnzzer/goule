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

// ── 图表基元 ────────────────────────────────────────────────────────
// 配色经 dataviz 校验器验证：浅色 #008060/#C47F12、深色 #17A472/#C0862B
// 均通过明度带、色度下限、CVD 分离度与 3:1 对比度五项检查。

/** 子弹图：一行一个自有量纲的观测值 vs 它自己的阈值，不共用坐标轴 */
function Bullet({ value, threshold, fired, lowerIsWorse, label }) {
  const scale = Math.max(value, threshold) * 1.25 || 1;
  const v = Math.min(100, (value / scale) * 100);
  const t = Math.min(100, (threshold / scale) * 100);
  return <span className={`bullet ${fired ? "fired" : ""}`} role="img" aria-label={label}>
    <i className="bullet-fill" style={{ width: `${v}%` }}/>
    <i className={`bullet-thresh ${lowerIsWorse ? "lower" : ""}`} style={{ left: `${t}%` }}/>
  </span>;
}

/** 100% 构成条：只用于同一个量的内部拆分，段间留 2px 底色缝 */
function StackBar({ parts }) {
  const sum = parts.reduce((t, p) => t + p.value, 0) || 1;
  return <div className="stack">
    {parts.map(p => <i key={p.key} className={`stack-seg seg-${p.key}`}
      style={{ width: `${(p.value / sum) * 100}%` }} title={`${p.label} ${fmtInt(p.value)}`}/>)}
  </div>;
}

/** 增删条：两个方向共用一条基线，比例可跨提交比较 */
function DiffBar({ insertions, deletions, scale }) {
  const s = scale || 1;
  return <span className="diffbar" title={`+${insertions} / −${deletions}`}>
    <i className="diff-add" style={{ width: `${(insertions / s) * 100}%` }}/>
    <i className="diff-del" style={{ width: `${(deletions / s) * 100}%` }}/>
  </span>;
}

/** 小倍数柱：24 小时同一坐标轴，供动手与点击各画一张 */
function HourBars({ values, unit, tone }) {
  const max = Math.max(1, ...values);
  return <div className={`hours tone-${tone}`}>
    <div className="hour-cols" role="img" aria-label={`按小时分布，单位${unit}`}>
      {values.map((v, h) => <i key={h} style={{ height: `${v > 0 ? Math.max(6, (v / max) * 100) : 0}%` }}
        className={v > 0 ? "" : "zero"}
        title={`${String(h).padStart(2, "0")}:00 · ${Math.round(v)} ${unit}`}/>)}
    </div>
    <div className="hour-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
  </div>;
}

/** 行内比例条，配合同行的数值使用（数值本身就是直接标注） */
function MiniBar({ value, max, tone }) {
  return <span className={`mini tone-${tone}`}>
    <i style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }}/>
  </span>;
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

function CommitRow({ c, scale }) {
  return <div className="commit-row">
    <code className="commit-hash">{c.hash}</code>
    {c.type && <span className="commit-type">{c.type}{c.scope ? `(${c.scope})` : ""}</span>}
    <span className="commit-subject">{c.description || c.subject}</span>
    <DiffBar insertions={c.insertions} deletions={c.deletions} scale={scale}/>
    <span className="commit-stat">
      <span className="add">+{c.insertions}</span><span className="del">−{c.deletions}</span>
    </span>
    <span className="commit-time">{fmtTime(c.at)}</span>
    {c.copies > 0 && <span className="commit-copy" title="同一提交被 cherry-pick 到别的分支，已合并为一条">+{c.copies} 副本</span>}
  </div>;
}

function SessionRow({ s, maxMin, maxOut }) {
  const t = s.tokens;
  return <div className="session-row">
    <span className="session-tool">{s.tool === "claude-code" ? "CC" : "CX"}</span>
    <span className="session-title">
      {s.title || <em className="empty-note">无标题（Codex 不提供，留空不编造）</em>}
      {s.isSidechain && <span className="session-tag">subagent</span>}
    </span>
    <MiniBar value={s.minutes} max={maxMin} tone="a"/>
    <span className="session-min">{s.minutes >= 1 ? fmtDur(s.minutes * MIN) : (s.minutes > 0 ? "<1m" : "—")}</span>
    <MiniBar value={t.output} max={maxOut} tone="b"/>
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
              <div className="session-head"><span/><span>会话</span><span>动手</span><span>输出</span></div>
              <div className="session-list">{g.sessions.map(s =>
                <SessionRow key={s.id} s={s}
                  maxMin={Math.max(...g.sessions.map(x => x.minutes), 1)}
                  maxOut={Math.max(...g.sessions.map(x => x.tokens.output), 1)}/>)}</div>
            </div>
            <div className="detail-block">
              <div className="detail-label">提交</div>
              {g.commits.length
                ? <div className="commit-list">{g.commits.map(c =>
                    <CommitRow key={c.hash} c={c}
                      scale={Math.max(...g.commits.map(x => Math.max(x.insertions, x.deletions)), 1)}/>)}</div>
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
const TOOL_LABEL = { "claude-code": "Claude Code", codex: "Codex" };
const BY_TOOL = (() => {
  const m = new Map();
  for (const s of D.sessions) {
    const cur = m.get(s.tool) || { tool: s.tool, output: 0, sessions: 0 };
    cur.output += s.tokens.output;
    cur.sessions++;
    m.set(s.tool, cur);
  }
  return [...m.values()].sort((a, b) => b.output - a.output);
})();

function Tokens() {
  const t = D.tokens;
  const uncached = D.tokenSummary.uncachedInput;
  const hit = t.cacheRead / (uncached + t.cacheRead);
  const maxOut = Math.max(1, ...BY_TOOL.map(x => x.output));
  return <section className="panel" id="tokens">
    <h3>Token 用量</h3>

    <div className="stat-lead">
      <span className="stat-value">{fmtInt(t.output)}</span>
      <span className="stat-unit">输出 tokens</span>
    </div>
    <p className="panel-note">其中推理 {fmtCompact(t.reasoning)}。这是当天真正被生成出来的量。</p>

    <div className="chart-block">
      <div className="chart-title">按工具的输出量</div>
      {BY_TOOL.map(x => <div className="tool-row" key={x.tool}>
        <span className="tool-name">{TOOL_LABEL[x.tool] || x.tool}</span>
        <MiniBar value={x.output} max={maxOut} tone="a"/>
        <span className="tool-value">{fmtCompact(x.output)}</span>
        <span className="tool-meta">{x.sessions} 个会话</span>
      </div>)}
    </div>

    <div className="chart-block">
      <div className="chart-title">输入构成 · 缓存命中 {(hit * 100).toFixed(0)}%</div>
      <StackBar parts={[
        { key: "uncached", value: uncached, label: "未命中缓存" },
        { key: "cached", value: t.cacheRead, label: "缓存读取" },
      ]}/>
      <div className="stack-legend">
        <span><i className="key seg-uncached"/>未命中缓存 {fmtCompact(uncached)}</span>
        <span><i className="key seg-cached"/>缓存读取 {fmtCompact(t.cacheRead)}</span>
      </div>
    </div>

    <p className="panel-caveat">
      输入量与输出量是两个不同的度量，刻意分成两张图、不共用坐标轴。
      输入量也不代表「你写了多少」：每一轮都要重发上下文，没命中缓存的部分会反复计入。
    </p>
  </section>;
}

// ── 按小时分布：动手与点击各一张小倍数，同一条 24 小时坐标轴 ────────
const COVERAGE_LABEL = { complete: "完整", partial: "部分", unavailable: "不可用" };

function Hourly() {
  const m = D.mouse;
  const handTotal = D.handsOnByHour.reduce((a, b) => a + b, 0);
  const activeHours = D.handsOnByHour.filter(v => v > 0).length;
  const peak = D.handsOnByHour.indexOf(Math.max(...D.handsOnByHour));
  return <section className="panel" id="hourly">
    <h3>按小时分布</h3>

    <div className="chart-block">
      <div className="chart-title">动手分钟数 · 覆盖 {activeHours} 个小时，峰值在 {String(peak).padStart(2, "0")}:00</div>
      <HourBars values={D.handsOnByHour} unit="分钟" tone="a"/>
    </div>

    <div className="chart-block">
      <div className="chart-title">鼠标点击次数</div>
      {m.enabled
        ? <>
            <HourBars values={m.byHour} unit="次" tone="b"/>
            <p className="panel-note">
              共 {fmtInt(m.clicks)} 次 · 采集 {fmtDur(m.observedMinutes * MIN)} · {m.provider} · 覆盖 {COVERAGE_LABEL[m.coverage]}
            </p>
          </>
        : <div className="chart-empty">
            <span>采集未开启，这一格没有数据——不画占位曲线。</span>
            <code className="cmd">goule activity start</code>
          </div>}
    </div>

    <p className="panel-caveat">
      两张图共用 24 小时坐标轴但<strong>各自独立</strong>：分钟数与点击次数量纲不同，不叠在一张图上。
      点击数是独立活动证据，<strong>不计入动手时长</strong>，也不参与压力信号。
      动手合计 {fmtDur(handTotal * MIN)}。
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
            ? `${D.signals.length} 项信号全部未触发。每一项按自己的量纲和阈值单独衡量，不合成分数。`
            : `${D.signals.length} 项中触发了 ${fired.length} 项。压力债 ${D.debt.toFixed(2)}。`}
        </p>
      </div>
      <div className="legend legend-static">
        <span><i className="key bullet-key"/>观测值</span>
        <span><i className="key thresh-key"/>阈值</span>
      </div>
    </div>
    <div className="signals">
      {D.signals.map(s => {
        const meta = SIGNAL_META[s.id] || { label: s.id, unit: "m" };
        const dir = meta.lowerIsWorse ? "低于" : "超过";
        return <div className={`signal ${s.fired ? "fired" : ""}`} key={s.id}>
          <span className="signal-name">
            {meta.label}
            {s.fired && <span className="signal-flag">已触发</span>}
          </span>
          {meta.unit === "bool"
            ? <span className={`bool-chip ${s.value ? "on" : ""}`}>{s.value ? "是" : "否"}</span>
            : <Bullet value={s.value} threshold={s.threshold} fired={s.fired}
                lowerIsWorse={meta.lowerIsWorse}
                label={`${meta.label} ${fmtSignal(s.value, meta.unit)}，${dir} ${fmtSignal(s.threshold, meta.unit)} 触发`}/>}
          <span className="signal-value">{fmtSignal(s.value, meta.unit)}</span>
          <span className="signal-threshold">{dir} {fmtSignal(s.threshold, meta.unit)}</span>
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
            <div className="panel-row"><Tokens/><Hourly/></div>
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
        options={[["#0A6B4E","#C47F12","#FFFFFF"],["#F99C00","#00A873","#F3F4F6"],["#62D6A7","#C0862B","#0D141C"],["#F0A96B","#E9CF82","#17120F"]]}
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
  "#0A6B4E": { mint: "#008060", amber: "#C47F12", night: "#FFFFFF" },
  "#187A55": { mint: "#008060", amber: "#C47F12", night: "#FFFFFF" },
  "#F99C00": { mint: "#F99C00", amber: "#00A873", night: "#F3F4F6" },
  "#62D6A7": { mint: "#17A472", amber: "#C0862B", night: "#0D141C" },
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
