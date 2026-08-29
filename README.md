# 够了·到点下班（Goule）

> **Enough, clock out.**

本地优先的「今日工作核验 + 日报双模」工具：读取 Git 与 AI 编码 session，按你自己定义的规则告诉你**够了没有**，并生成可复制的证据页。

## 状态

🚧 **Phase 1 设计已冻结，实现中。**

首期做**事实层**：读取本机 Claude Code 与 Codex 的 session 元数据、结合本地 Git 提交，产出一份「今天干了什么」的结构化日报，并计算压力信号。**首期不做判定**——没有红绿灯、没有分数、没有规则引擎。

设计文档：[Phase 1 设计](docs/superpowers/specs/2026-08-29-goule-phase1-design.md) · [产品需求文档](docs/PRD.md)

## 为什么先做这个

`git-standup` 给你 commit 列表，`worklog` 给你时长，但没有工具能告诉你：

> 在 `acme-api/master` 上，2 个 AI session（164 min）产出了 5 个 commit。

把 AI session 和 Git 提交**关联起来**，是首期唯一不可替代的输出。而规则引擎的价值取决于阈值定得准不准，阈值需要真实数据来标定——所以数据管道先于规则引擎。

### 工时口径：`hands_on` 而非「有记录」

在 agent 编码时代，「session 开着」和「人在工作」是两回事。实测本机数据：**真人输入只占全部 session 记录的 8.9%**，若把所有记录当活跃信号，30 天工时会虚高 **63%**，最坏单日虚高 **7.3 倍**（一个跨 13 天、466 MB 的 rollout 文件独自贡献了 18.7 小时的虚假工时）。

Goule 因此把两个量分开，且**永不相加**：

- `hands_on_minutes` —— 真人输入锚定，**唯一工时口径**，「够了没」与压力分析只用它
- `agent_minutes` —— agent 自主运行时长，是产出杠杆的证据，不是工时

### 压力降低「够了」的门槛

压力分析**不出独立分数**。一个说「你压力 78 分」却不给动作的数字，只会变成又一个自我鞭挞的指标。Goule 让压力成为**下班的理由**：昨夜熬到 01:20、已连续 6 天无休 → 今天「够了」的门槛自动下调，结论写成「你昨天透支了，今天这些就够了」。

信号锚定 hands_on（agent 跑一整夜不会让人疲劳），基线用**你自己的历史 P90** 而非硬编码工时。

## 核心原则

- **Local-first**：默认无账号、无遥测，数据保存在 `~/.goule/`。
- **Evidence over vibe**：红绿灯只由可审计规则决定，AI 不参与 verdict。
- **Rules you own**：规则由用户拥有和配置，不硬编码“996 标准”。
- **Dual face**：同一份数据支持收工核验和日报输出。
- **No keylogger**：不记录源码、按键内容或 IM 正文。
- **事实层独立成立**：LLM 润色是叠加层而非替代层，生成内容在输出中必须可区分。

## 快速开始（开发中）

需要 [Bun](https://bun.sh/) 1.1+ 和 Git 2.30+：

```bash
bun install
bun run dev -- report
```

当前为 CLI 骨架。Phase 1 的数据采集、时间轴与日报渲染按上述设计文档逐步实现。

### 鼠标点击活动（可选）

鼠标点击统计默认关闭。显式启动后，Goule 只保存按逻辑日和本地小时聚合的点击次数，
不保存坐标、窗口名、应用名、设备信息或原始事件：

```bash
goule activity start     # 前台运行，Ctrl-C 停止
goule activity status
goule activity stop
```

macOS 首次启动需要给运行 Goule 的终端或 helper 授予“辅助功能”权限；没有权限时采集器
会退出并提示原因。点击次数会作为独立活动证据出现在 `activity.mouseClicks`，不会并入
`handsOn.minutes`、压力信号或任何“工作时长”计算。

## 数据来源

| 来源 | 采集内容 | 状态 |
| --- | --- | --- |
| Claude Code | session 元数据：时间戳、cwd、分支、标题、token（含 subagent） | ✅ 已接入 |
| Codex | session 元数据：时间戳、cwd、分支、起始 commit、token | ✅ 已接入 |
| 本地 Git | commit 元数据、增删行数、Conventional Commits 分类 | ✅ 已接入 |
| 鼠标点击 | 逻辑日/小时聚合的点击次数（可选、本地） | macOS MVP |
| Cursor | — | 未排期（`state.vscdb` 为未公开 schema） |
| ActivityWatch / 飞书 | — | Phase 3 |

**不采集**：对话正文、源码内容、完整 diff、按键内容。

### token 的两个坑

两家工具的 usage 都不能直接相加，实测：

- **Claude Code 会重复落盘同一条 assistant 消息**：145 条 usage 记录只有 86 个不同
  `message.id`，不按 id 去重会让 token 虚高约 **65%**。
- **Codex 的 `total_token_usage` 是会话累计值**，每条 `token_count` 都重报全量，
  相加会随消息条数线性虚高，只能取增量。

token 按**事件时间**归属到逻辑日，而不是把整份 session 文件记到今天——扫描窗口
有 30 天宽，否则一个月的用量会全算成今天的产出。

另外 `input` 不代表「你写了多少」：每轮都要重发上下文，未命中缓存的部分反复计入。
只有 `output` 是当天真正被生成出来的量。

### git 的一个坑

`--all` 会同时看到 feature 分支上的原件和 cherry-pick 到 dev 之后的副本，
两者 hash 不同但 author date / 作者 / 标题一致。实测某日 4 条提交里有 2 对是
这种副本，不合并会让「今天提交了几个」翻倍。Goule 合并它们，并把副本 hash
记在 `copies` 里，不静默丢弃。

提交按 **author date** 归属，不用 commit date——rebase / amend 会重写后者。

## 品牌文案

| Verdict | 文案 |
| --- | --- |
| `GO` | **够了，到点下班** |
| `CAUTION` | **差不多，你说了算** |
| `NO_GO` | **证据还差点，再补一块** |

> Verdict 属于 Phase 2。首期只呈现事实，不下结论。

## 规划

- **Phase 1（当前）**：Claude Code / Codex session + 本地 Git → 结构化日报；hands_on / agent 工时拆分；压力信号计算；可选 LLM 润色层
- **Phase 2**：规则引擎、产能分、`check`、**压力债 → 门槛折扣**、快照层、规则包与首周校准
- **Phase 3**：本地 Dashboard、ActivityWatch、飞书元数据、规则市场
- **后续**：Cursor 接入、周报聚合、定时提醒

> 该排期主动重排了 PRD v0.2 的原顺序，理由见[设计文档 §1.1](docs/superpowers/specs/2026-08-29-goule-phase1-design.md)。

## 开源协议

MIT License，见 [LICENSE](LICENSE)。
