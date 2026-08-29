const { useEffect, useMemo, useState } = React;
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } = window;

const DATA = {
  day: "2026-08-28",
  boundary: { start: 1787860800000, end: 1787947200000 },
  handMinutes: 155.21325,
  agentMinutes: 174.35208333333335,
  sessionCount: 19,
  baseline: { p90: 281.73099, days: 30 },
  handBlocks: [[1787882712162,1787883222762],[1787883717800,1787884219482],[1787884546072,1787884606072],[1787885415820,1787885629549],[1787885645112,1787885645161],[1787885679454,1787888398140],[1787888562133,1787888781527],[1787890128408,1787890718109],[1787891341803,1787891401803],[1787894318760,1787894378760],[1787896714498,1787896774498],[1787897092157,1787897152157],[1787897953010,1787898288878],[1787898507601,1787898507836],[1787898565701,1787898565837],[1787898603079,1787898603201],[1787899289372,1787899699269],[1787900275120,1787900335120],[1787901682153,1787902979523],[1787904406536,1787904466536],[1787905093238,1787905153238],[1787906148836,1787907210514],[1787907840888,1787908814536]],
  agentBlocks: [[1787882705747,1787883290311],[1787883717800,1787884605017],[1787885414771,1787885659084],[1787885679453,1787885698447],[1787885724341,1787885726549],[1787885777278,1787888505579],[1787888561766,1787898382336],[1787898507514,1787898530366],[1787898564659,1787898585750],[1787898602014,1787898624449],[1787899289333,1787899719324],[1787900117674,1787900117675],[1787900244211,1787900936096],[1787901682152,1787903126123],[1787904406536,1787904443490],[1787905093237,1787905174778],[1787906148835,1787908825867],[1787922212407,1787922272407]],
  groups: [
    { cwd: "/Users/you/work/acme-api", branch: "master", minutes: 157.32816666666668, sessions: 11, tools: ["claude-code", "codex"], titles: ["接口 diff 复核", "分支重建与档位新增", "技术方案分析"] },
    { cwd: "/Users/you", branch: null, minutes: 6.56355, sessions: 6, tools: ["codex"], titles: [] },
    { cwd: "/Users/you", branch: "HEAD", minutes: 2, sessions: 2, tools: ["claude-code"], titles: [] }
  ]
};

const PALETTES = {
  "#187A55": { mint: "#187A55", amber: "#B56A22", night: "#FFFFFF" },
  "#F99C00": { mint: "#F99C00", amber: "#00A873", night: "#F3F4F6" },
  "#62D6A7": { mint: "#62D6A7", amber: "#F4B65F", night: "#0D141C" },
  "#7FB8FF": { mint: "#7FB8FF", amber: "#B7A2F6", night: "#0B1320" },
  "#F0A96B": { mint: "#B86F2F", amber: "#C6923F", night: "#17120F" }
};

const THEMES = {
  night: {},
  pure: {
    night: "#FFFFFF",
    surface: "#FFFFFF",
    surface2: "#F5F6F4",
    paper: "#171A18",
    muted: "#68716B"
  },
  cafe: {
    night: "#F3F4F6",
    surface: "#FFFFFF",
    surface2: "#E2E3E7",
    paper: "#18181B",
    muted: "#52525B"
  },
  warm: {
    night: "#EEE8DC",
    surface: "#F8F4EB",
    surface2: "#E7DFD1",
    paper: "#28322D",
    muted: "#6D776F"
  }
};

function Icon({ name }) {
  const paths = {
    today: <><path d="M4 6.5h16M7 3v4M17 3v4M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="m8 13 2.3 2.3L16 10"/></>,
    ledger: <><path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M8 3v18M11 8h5M11 12h5"/></>,
    tune: <><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    left: <path d="m15 18-6-6 6-6"/>,
    right: <path d="m9 18 6-6-6-6"/>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function formatMinutes(value) {
  const total = Math.round(value);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}
function formatTime(ms) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)); }

function Timeline({ emphasis }) {
  const [visible, setVisible] = useState({ hand: true, agent: true });
  const [hover, setHover] = useState(null);
  const span = DATA.boundary.end - DATA.boundary.start;
  const pos = ms => ((ms - DATA.boundary.start) / span) * 100;
  const ticks = [4,8,12,16,20,24,28];
  const layerDim = type => emphasis !== "balanced" && emphasis !== type;
  const blocks = (items, type) => visible[type] && items.map(([start,end], i) => {
    const duration = Math.max(0, (end-start)/60000);
    return <div key={`${type}-${i}`} className={`block ${type} ${layerDim(type) ? "dim" : ""}`}
      style={{ left: `${pos(start)}%`, width: `${Math.max(.2, pos(end)-pos(start))}%` }}
      onMouseEnter={e => setHover({ x: pos((start+end)/2), y: type === "hand" ? 18 : 59, label: `${formatTime(start)}–${formatTime(end)} · ${duration < 1 ? "<1" : Math.round(duration)} min` })}
      onMouseLeave={() => setHover(null)} aria-label={`${type === "hand" ? "动手" : "Agent"} ${formatTime(start)} 到 ${formatTime(end)}`} />;
  });
  return <section className="section" id="timeline">
    <div className="section-head">
      <div><div className="section-kicker">04:00 → NEXT 04:00</div><h2>收工刻度</h2></div>
      <div className="legend">
        <button className={!visible.hand ? "off" : ""} onClick={() => setVisible(v => ({...v, hand: !v.hand}))}><i className="key hand"/>动手</button>
        <button className={!visible.agent ? "off" : ""} onClick={() => setVisible(v => ({...v, agent: !v.agent}))}><i className="key agent"/>Agent 自主</button>
      </div>
    </div>
    <div className="timeline-card">
      <div className="timeline">
        <span className="track-label hand">HANDS</span><span className="track-label agent">AGENT</span>
        {ticks.map(h => <React.Fragment key={h}><i className="grid-line" style={{left:`${((h-4)/24)*100}%`}}/><span className="tick" style={{left:`${((h-4)/24)*100}%`}}>{String(h%24).padStart(2,"0")}:00</span></React.Fragment>)}
        {blocks(DATA.handBlocks, "hand")}{blocks(DATA.agentBlocks, "agent")}
        {hover && <div className="time-tooltip" style={{left:`${hover.x}%`,top:hover.y}}>{hover.label}</div>}
      </div>
      <div className="timeline-caption"><span><strong>实线是你的输入证据，半透明是工具运行区间。</strong><br/>二者可能重叠，不直接相加为工作时长。</span><span>活跃集中在 10:05–17:46<br/>夜间活动 0 min</span></div>
    </div>
  </section>;
}

function Ledger() {
  const [open, setOpen] = useState(0);
  return <section className="section" id="evidence">
    <div className="section-head"><div><div className="section-kicker">EVIDENCE LEDGER</div><h2>证据簿</h2></div><div className="legend">按工作目录与分支归组 · 会话时长可重叠</div></div>
    <div className="ledger">{DATA.groups.map((g,i) => <div className={`ledger-row ${open===i?"open":""}`} key={i}>
      <button className="ledger-summary" onClick={() => setOpen(open===i ? -1 : i)} aria-expanded={open===i}>
        <span className="project-index">0{i+1}</span>
        <span><span className="project-name">{g.cwd}</span><span className="project-meta"><span>{g.branch || "未识别分支"}</span><span>{g.tools.join(" + ")}</span><span>{g.sessions} sessions</span></span></span>
        <span className="project-time"><strong>{formatMinutes(g.minutes)}</strong><small>会话累计</small></span><span className="chevron"><Icon name="chevron"/></span>
      </button>
      {open===i && <div className="ledger-detail"><div><div className="detail-label">SESSION TITLES</div>{g.titles.length ? <div className="task-list">{g.titles.map(t=><span className="task-chip" key={t}>{t}</span>)}</div> : <span className="empty-note">这组会话没有可用标题，保留为未归因证据。</span>}</div><div><div className="detail-label">MEASUREMENT NOTE</div>这些分钟来自各会话记录，仅用于解释活动来源。并行会话可能重叠，因此不与动手时长相加。</div></div>}
    </div>)}</div>
  </section>;
}

function Stability() {
  return <section className="section stability">
    <div className="stability-main"><div className="stability-mark"><Icon name="check"/></div><div className="section-kicker">RECOVERY CHECK</div><h3>你的节奏很稳定</h3><p>今天没有出现需要提醒的恢复信号。这里只陈述观测事实，不给你打分，也不替你定义“够不够努力”。</p></div>
    <div className="stability-facts"><div className="fact"><span>距上次活动</span><code>9h 05m / 8h</code></div><div className="fact"><span>连续活跃</span><code>5d / 6d</code></div><div className="fact"><span>最长连续块</span><code>45m / 120m</code></div><div className="fact"><span>夜间 / 周末</span><code>0m / 0m</code></div><div className="fact"><span>触发信号</span><code>0 / 7</code></div></div>
  </section>;
}

const reportText = `# 2026-08-28 · 开发活动日报\n\n## 今日事实\n- 动手活动：2h 35m\n- Agent 自主活动：2h 54m\n- 有效会话：19\n- 30 天动手 P90：4h 42m\n\n## 主要证据\n- /Users/you/work/acme-api · master · 11 sessions\n- /Users/you · 未识别分支 · 6 sessions\n- /Users/you · HEAD · 2 sessions\n\n## 恢复观察\n7 项信号均未触发。距上次活动 9h 05m，最长连续块 45m。\n\n> 事实层 · 未启用规则判断`;

function Report({ onCopy, copied }) {
  return <div className="report-wrap"><div className="report-tools"><span>由同一份本地扫描数据生成</span><button className="copy-btn" onClick={onCopy}>{copied ? "已复制" : "复制 Markdown"}</button></div>
    <article className="report-paper"><div className="report-meta">GOULE DAILY · 2026-08-28</div><h2>开发活动日报</h2><p>今天发生了这些。</p><hr className="report-rule"/><h3>今日事实</h3><ul><li>动手活动：<code>2h 35m</code></li><li>Agent 自主活动：<code>2h 54m</code></li><li>有效会话：<code>19</code></li><li>30 天动手 P90：<code>4h 42m</code></li></ul><h3>主要证据</h3><ul><li><code>/Users/you/work/acme-api</code> · master · 11 sessions</li><li><code>/Users/you</code> · 未识别分支 · 6 sessions</li><li><code>/Users/you</code> · HEAD · 2 sessions</li></ul><div className="report-callout"><strong>你的节奏很稳定。</strong><p>7 项恢复信号均未触发；距上次活动 9h 05m，最长连续块 45m。</p></div><hr className="report-rule"/><div className="report-meta">事实层 · 未启用规则判断</div></article>
  </div>;
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
    ...Object.fromEntries(Object.entries(theme).map(([key,value]) => [`--${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`, value]))
  };
  const flash = msg => { setToast(msg); window.clearTimeout(window.__gouleToast); window.__gouleToast = window.setTimeout(() => setToast(""), 1800); };
  const copy = async () => { try { await navigator.clipboard.writeText(reportText); setCopied(true); flash("日报 Markdown 已复制"); window.setTimeout(()=>setCopied(false),1800); } catch { flash("浏览器未开放剪贴板权限"); } };
  const activateStyle = () => window.postMessage({type:"miaoda:tweaks:activate"}, "*");
  useEffect(() => {
    const key = e => { if (/input|textarea/i.test(e.target.tagName)) return; if (e.key.toLowerCase()==="r") setView(v=>v==="verify"?"report":"verify"); if (e.key.toLowerCase()==="c") copy(); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  const scroll = id => { setView("verify"); window.setTimeout(()=>document.getElementById(id)?.scrollIntoView(),0); };
  return <div className={`app density-${t.density} theme-${t.theme}`} style={cssVars}>
    <aside className="sidebar"><div className="brand"><svg className="brand-mark" viewBox="0 0 32 32" fill="none"><path d="M7 5h18v18l-5 5H7V5Z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 11h8M12 16h5M20 23v5" stroke="currentColor" strokeWidth="1.5"/></svg><div><strong>Goule</strong><small>evidence, gently</small></div></div>
      <nav className="side-nav"><button className="side-link active" onClick={()=>window.scrollTo({top:0})}><Icon name="today"/>今日</button><button className="side-link" onClick={()=>scroll("evidence")}><Icon name="ledger"/>证据簿</button><button className="side-link" onClick={activateStyle}><Icon name="tune"/>风格<span className="soon">LOCAL</span></button></nav>
      <div className="sidebar-foot"><div className="source-state"><i className="state-dot"/>本地数据已核验</div><code>generated 2026-08-29</code></div>
    </aside>
    <main className="main"><div className="main-inner">
      <header className="topbar"><div className="date-nav"><button className="icon-btn" onClick={()=>flash("原型暂只装载 2026-08-28 数据")} aria-label="前一天"><Icon name="left"/></button><div className="date-label"><strong>2026.08.28</strong><span>星期五</span></div><button className="icon-btn" disabled aria-label="后一天"><Icon name="right"/></button></div><button className="style-btn" onClick={activateStyle}><Icon name="tune"/><span>调整风格</span></button></header>
      <section className="hero"><div><p className="eyebrow">Friday · Local evidence</p><h1>今天发生了这些。</h1><p className="hero-copy">一份不催促你的开发活动底稿。它把动手输入、Agent 运行与会话来源摊开，让你在收工前看清事实。</p></div><div className="phase-note"><span>PHASE 1 · FACTS ONLY</span><p>事实层 · 未启用规则判断<br/>无评分，无效率结论，无虚构提交记录。</p></div></section>
      <div className="metric-strip"><div className="metric"><span className="metric-label">动手活动</span><strong className="metric-value">2h 35m</strong><small className="metric-meta">键盘与工具调用并集</small></div><div className="metric"><span className="metric-label">Agent 自主</span><strong className="metric-value">2h 54m</strong><small className="metric-meta">运行区间并集</small></div><div className="metric"><span className="metric-label">有效会话</span><strong className="metric-value">19</strong><small className="metric-meta">minutes &gt; 0</small></div><div className="metric"><span className="metric-label">30 天 P90</span><strong className="metric-value">4h 42m</strong><small className="metric-meta">基线样本充分</small></div></div>
      <div className="view-tabs" role="tablist"><button className={`view-tab ${view==="verify"?"active":""}`} onClick={()=>setView("verify")}>核验</button><button className={`view-tab ${view==="report"?"active":""}`} onClick={()=>setView("report")}>日报</button></div>
      {view==="verify" ? <><Timeline emphasis={t.timelineEmphasis}/><Ledger/><Stability/></> : <Report onCopy={copy} copied={copied}/>} 
    </div></main>
    <TweaksPanel title="Dusk Ledger"><TweakSection label="Atmosphere"/><TweakRadio label="底色" value={t.theme} options={[{value:"pure",label:"纯白"},{value:"cafe",label:"Vibe 灰"},{value:"warm",label:"暖纸"},{value:"night",label:"深夜"}]} onChange={v=>setTweak(v === "cafe" ? {theme:v,palette:["#F99C00","#00A873","#F3F4F6"]} : {theme:v})}/><TweakColor label="强调色" value={t.palette} options={[["#187A55","#B56A22","#FFFFFF"],["#F99C00","#00A873","#F3F4F6"],["#62D6A7","#F4B65F","#0D141C"],["#F0A96B","#E9CF82","#17120F"]]} onChange={v=>setTweak("palette",v)}/><TweakSection label="Layout"/><TweakRadio label="信息密度" value={t.density} options={[{value:"compact",label:"紧凑"},{value:"comfortable",label:"舒展"}]} onChange={v=>setTweak("density",v)}/><TweakSection label="Timeline"/><TweakRadio label="视觉重心" value={t.timelineEmphasis} options={[{value:"hand",label:"动手"},{value:"balanced",label:"平衡"},{value:"agent",label:"Agent"}]} onChange={v=>setTweak("timelineEmphasis",v)}/></TweaksPanel>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
