const { useEffect, useMemo, useState } = React;
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } = window;

const DATA = {
  day: "2026-08-28",
  boundary: { start: 1787860800000, end: 1787947200000 },
  sessionCount: 19,
  baseline: { p90: 281.73099, days: 30 },
  handBlocks: [[1787882712162,1787883222762],[1787883717800,1787884219482],[1787884546072,1787884606072],[1787885415820,1787885629549],[1787885645112,1787885645161],[1787885679454,1787888398140],[1787888562133,1787888781527],[1787890128408,1787890718109],[1787891341803,1787891401803],[1787894318760,1787894378760],[1787896714498,1787896774498],[1787897092157,1787897152157],[1787897953010,1787898288878],[1787898507601,1787898507836],[1787898565701,1787898565837],[1787898603079,1787898603201],[1787899289372,1787899699269],[1787900275120,1787900335120],[1787901682153,1787902979523],[1787904406536,1787904466536],[1787905093238,1787905153238],[1787906148836,1787907210514],[1787907840888,1787908814536]],
  agentBlocks: [[1787882705747,1787883290311],[1787883717800,1787884605017],[1787885414771,1787885659084],[1787885679453,1787885698447],[1787885724341,1787885726549],[1787885777278,1787888505579],[1787888561766,1787898382336],[1787898507514,1787898530366],[1787898564659,1787898585750],[1787898602014,1787898624449],[1787899289333,1787899719324],[1787900117674,1787900117675],[1787900244211,1787900936096],[1787901682152,1787903126123],[1787904406536,1787904443490],[1787905093237,1787905174778],[1787906148835,1787908825867],[1787922212407,1787922272407]],
  groups: [
    { cwd: "/Users/you/work/acme-api", branch: "master", minutes: 157.32816666666668, sessions: 11, tools: ["claude-code", "codex"], titles: ["接口 diff 复核", "分支重建与档位新增", "技术方案分析"] },
    { cwd: "/Users/you", branch: null, minutes: 6.56355, sessions: 6, tools: ["codex"], titles: [] },
    { cwd: "/Users/you", branch: "HEAD", minutes: 2, sessions: 2, tools: ["claude-code"], titles: [] }
  ],
  signals: [
    { name: "距上次活动", value: "9h 05m", threshold: "8h" },
    { name: "连续活跃", value: "5d", threshold: "6d" },
    { name: "最长连续块", value: "45m", threshold: "120m" },
    { name: "夜间活动", value: "0m", threshold: "0m" },
    { name: "周末活动", value: "0m", threshold: "0m" }
  ]
};

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

const HAND = union(DATA.handBlocks);
const AGENT_ALL = union(DATA.agentBlocks);
const AGENT_ONLY = subtract(AGENT_ALL, HAND);
const OVERLAP = intersect(AGENT_ALL, HAND);

const HAND_MS = total(HAND);
const AGENT_ONLY_MS = total(AGENT_ONLY);
const OVERLAP_MS = total(OVERLAP);
const P90_MS = DATA.baseline.p90 * MIN;

// 轴裁到真正有活动的区间，避免整条时间轴三分之二是空的
const AXIS = (() => {
  const all = [...HAND, ...AGENT_ALL];
  const lo = Math.min(...all.map(x => x[0]));
  const hi = Math.max(...all.map(x => x[1]));
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
  const [visible, setVisible] = useState({ hand: true, agent: true });
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
      onMouseEnter={() => setHover({ x: pos((s + e) / 2), row: cls, label: `${name} · ${fmtTime(s)}–${fmtTime(e)} · ${readable}` })}
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

        <div className="lane lane-off">
          <span className="lane-label">提交</span>
          <div className="lane-track"><span className="lane-empty">未接入 Git 提交 · Phase 1 数据源未启用</span></div>
          <span className="lane-total">—</span>
        </div>

        <div className="axis">
          {ticks.map((t, i) => <span key={`t${i}`} className="tick" style={{ left: `${pos(t)}%` }}>{fmtTime(t)}</span>)}
        </div>

        {hover && <div className={`time-tooltip row-${hover.row}`} style={{ left: `${hover.x}%` }}>{hover.label}</div>}
      </div>

      <p className="timeline-caption">
        实心 = 你的输入证据，条纹 = Agent 在你动手期间同时运行（<strong>不计入 Agent 独占</strong>，共 {fmtDur(OVERLAP_MS)}）。
        短于 2 分钟的活动以细线标记，不放大成块。轴已裁到有活动的区间。
      </p>
    </div>
  </section>;
}

// ── 证据簿 ──────────────────────────────────────────────────────────
function LedgerRow({ group, index, share, open, onToggle }) {
  const cut = group.cwd.lastIndexOf("/");
  const parent = group.cwd.slice(0, cut + 1);
  const leaf = group.cwd.slice(cut + 1) || group.cwd;
  return <div className={`ledger-row ${open ? "open" : ""}`}>
    <button className="ledger-summary" onClick={onToggle} aria-expanded={open}>
      <span className="project-index">{String(index).padStart(2, "0")}</span>
      <span className="project-main">
        <span className="project-name"><span className="path-dim">{parent}</span>{leaf}</span>
        <span className="project-meta">
          <span>{group.branch || "未识别分支"}</span>
          <span>{group.tools.join(" + ")}</span>
          <span>{group.sessions} sessions</span>
        </span>
      </span>
      <span className="project-share"><i style={{ width: `${share}%` }}/></span>
      <span className="project-time">{fmtDur(group.minutes * MIN)}</span>
      <span className="chevron"><Icon name="chevron"/></span>
    </button>
    {open && <div className="ledger-detail">
      <div>
        <div className="detail-label">会话标题</div>
        {group.titles.length
          ? <div className="task-list">{group.titles.map(t => <span className="task-chip" key={t}>{t}</span>)}</div>
          : <span className="empty-note">这组会话没有可用标题。</span>}
      </div>
      <div>
        <div className="detail-label">口径说明</div>
        这些分钟来自各会话记录，只用于解释活动来源。并行会话可能重叠，因此不与动手时长相加。
      </div>
    </div>}
  </div>;
}

function Ledger() {
  const [open, setOpen] = useState(0);
  const named = DATA.groups.filter(g => g.branch && g.branch !== "HEAD");
  const loose = DATA.groups.filter(g => !g.branch || g.branch === "HEAD");
  const max = Math.max(...DATA.groups.map(g => g.minutes));
  const looseTotal = loose.reduce((t, g) => t + g.minutes, 0);
  return <section className="section" id="evidence">
    <div className="section-head">
      <div>
        <h2>证据簿</h2>
        <p className="section-note">按工作目录与分支归组，会话时长可重叠</p>
      </div>
    </div>
    <div className="ledger">
      {named.map((g, i) => <LedgerRow key={i} group={g} index={i + 1} share={(g.minutes / max) * 100}
        open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}
    </div>
    <div className="ledger-loose">
      <div className="loose-head">
        <span>未归因证据</span>
        <span>{loose.length} 组 · {fmtDur(looseTotal * MIN)}</span>
      </div>
      {loose.map((g, i) => <div className="loose-row" key={i}>
        <span className="project-name">{g.cwd}</span>
        <span className="project-meta"><span>{g.branch || "未识别分支"}</span><span>{g.tools.join(" + ")}</span><span>{g.sessions} sessions</span></span>
        <span className="project-time">{fmtDur(g.minutes * MIN)}</span>
      </div>)}
      <p className="loose-note">没有可靠分支归属的会话保留为独立行，不并入上面的项目统计，也不丢弃。</p>
    </div>
  </section>;
}

// ── 恢复信号 ────────────────────────────────────────────────────────
function Recovery() {
  return <section className="section" id="recovery">
    <div className="section-head">
      <div>
        <h2>今天的恢复信号</h2>
        <p className="section-note">7 项信号全部未触发，以下是其中 {DATA.signals.length} 项的观测值。只陈述事实，不打分。</p>
      </div>
    </div>
    <div className="signals">
      {DATA.signals.map(s => <div className="signal" key={s.name}>
        <span className="signal-name">{s.name}</span>
        <span className="signal-value">{s.value}</span>
        <span className="signal-threshold">阈值 {s.threshold}</span>
      </div>)}
    </div>
  </section>;
}

// ── 日报 ────────────────────────────────────────────────────────────
const reportText = `# 2026-08-28 · 开发活动日报

## 今日事实
- 动手活动：${fmtDur(HAND_MS)}
- Agent 独占运行：${fmtDur(AGENT_ONLY_MS)}（另有 ${fmtDur(OVERLAP_MS)} 与动手重叠，不计入）
- 有效会话：${DATA.sessionCount}
- 30 天动手 P90：${fmtDur(P90_MS)}

## 主要证据
- /Users/you/work/acme-api · master · 11 sessions
- 未归因：/Users/you · 8 sessions · ${fmtDur(8.56355 * MIN)}

## 恢复观察
7 项信号均未触发。距上次活动 9h 05m，最长连续块 45m。

> 事实层 · 未启用规则判断`;

function Report({ onCopy, copied }) {
  return <div className="report-wrap">
    <div className="report-tools">
      <span>与核验页同一份本地扫描数据</span>
      <button className="copy-btn" onClick={onCopy}>{copied ? "已复制" : "复制 Markdown"}</button>
    </div>
    <article className="report-paper">
      <div className="report-meta">GOULE DAILY · 2026-08-28</div>
      <h2>开发活动日报</h2>
      <p>今天动手 {fmtDur(HAND_MS)}，分布在 {fmtTime(HAND_FIRST)} 到 {fmtTime(HAND_LAST)} 之间。</p>
      <hr className="report-rule"/>
      <h3>今日事实</h3>
      <ul>
        <li>动手活动：<code>{fmtDur(HAND_MS)}</code></li>
        <li>Agent 独占运行：<code>{fmtDur(AGENT_ONLY_MS)}</code>（另有 <code>{fmtDur(OVERLAP_MS)}</code> 与动手重叠，不计入）</li>
        <li>有效会话：<code>{DATA.sessionCount}</code></li>
        <li>30 天动手 P90：<code>{fmtDur(P90_MS)}</code></li>
      </ul>
      <h3>主要证据</h3>
      <ul>
        <li><code>/Users/you/work/acme-api</code> · master · 11 sessions</li>
        <li>未归因：<code>/Users/you</code> · 8 sessions · {fmtDur(8.56355 * MIN)}</li>
      </ul>
      <div className="report-callout">
        <strong>今天没有触发恢复信号。</strong>
        <p>距上次活动 9h 05m，最长连续块 45m。</p>
      </div>
      <hr className="report-rule"/>
      <div className="report-meta">事实层 · 未启用规则判断</div>
    </article>
  </div>;
}

// ── 首屏 ────────────────────────────────────────────────────────────
function Hero() {
  const topGroup = DATA.groups[0];
  const leaf = topGroup.cwd.slice(topGroup.cwd.lastIndexOf("/") + 1);
  const ratio = Math.min(1, HAND_MS / P90_MS) * 100;
  return <section className="hero">
    <div className="hero-main">
      <h1>今天动手 <b>{fmtDur(HAND_MS)}</b></h1>
      <p className="hero-sub">{fmtTime(HAND_FIRST)} – {fmtTime(HAND_LAST)} · {DATA.sessionCount} 个会话 · 主要在 {leaf}</p>
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
        <span className="aside-label">与动手重叠</span>
        <span className="aside-value">{fmtDur(OVERLAP_MS)}</span>
        <span className="aside-note">机器在你动手期间同时在跑</span>
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

  return <div className={`app density-${t.density} theme-${t.theme}`} style={cssVars}>
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" fill="none"><path d="M7 5h18v18l-5 5H7V5Z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 11h8M12 16h5M20 23v5" stroke="currentColor" strokeWidth="1.5"/></svg>
        <strong>Goule</strong>
      </div>
      <div className="date-nav">
        <button className="icon-btn" onClick={() => flash("原型暂只装载 2026-08-28 数据")} aria-label="前一天"><Icon name="left"/></button>
        <span className="date-label"><strong>2026.08.28</strong><span>星期五</span></span>
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
        ? <><Hero/><Timeline emphasis={t.timelineEmphasis}/><Ledger/><Recovery/></>
        : <Report onCopy={copy} copied={copied}/>}
    </div></main>

    <footer className="page-foot"><div className="main-inner">
      <span><i className="state-dot"/>本地数据已核验 · 无遥测</span>
      <span>事实层 · 未启用规则判断：无评分、无效率结论、无虚构提交记录</span>
      <code>generated 2026-08-29</code>
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
