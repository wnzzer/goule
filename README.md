# 够了·到点下班（Goule）

> **Enough, clock out.**

本地优先的「今日工作核验 + 日报双模」工具：读取 Git 与 AI 编码 session，按你自己定义的规则告诉你**够了没有**，并生成可复制的证据页。

## 状态

🚧 **Phase 1 设计已冻结，实现中。**

首期做**事实层**：读取本机 Claude Code 与 Codex 的 session 元数据、结合本地 Git 提交，产出一份「今天干了什么」的结构化日报。**首期不做判定**——没有红绿灯、没有分数、没有规则引擎。

设计文档：[Phase 1 设计](docs/superpowers/specs/2026-08-29-goule-phase1-design.md) · [产品需求文档](docs/PRD.md)

## 为什么先做这个

`git-standup` 给你 commit 列表，`worklog` 给你时长，但没有工具能告诉你：

> 在 `acme-api/master` 上，2 个 AI session（164 min）产出了 5 个 commit。

把 AI session 和 Git 提交**关联起来**，是首期唯一不可替代的输出。而规则引擎的价值取决于阈值定得准不准，阈值需要真实数据来标定——所以数据管道先于规则引擎。

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

## 数据来源

| 来源 | 采集内容 | 状态 |
| --- | --- | --- |
| Claude Code | session 元数据：时间戳、cwd、分支、标题、token（含 subagent） | Phase 1 |
| Codex | session 元数据：时间戳、cwd、分支、起始 commit、token | Phase 1 |
| 本地 Git | commit 元数据、增删行数、Conventional Commits 分类 | Phase 1 |
| Cursor | — | 未排期（`state.vscdb` 为未公开 schema） |
| ActivityWatch / 飞书 | — | Phase 3 |

**不采集**：对话正文、源码内容、完整 diff、按键内容。

## 品牌文案

| Verdict | 文案 |
| --- | --- |
| `GO` | **够了，到点下班** |
| `CAUTION` | **差不多，你说了算** |
| `NO_GO` | **证据还差点，再补一块** |

> Verdict 属于 Phase 2。首期只呈现事实，不下结论。

## 规划

- **Phase 1（当前）**：Claude Code / Codex session + 本地 Git → 结构化日报；可选 LLM 润色层
- **Phase 2**：规则引擎、产能分、`check`、快照层、规则包与首周校准
- **Phase 3**：本地 Dashboard、ActivityWatch、飞书元数据、规则市场
- **后续**：Cursor 接入、周报聚合、定时提醒

> 该排期主动重排了 PRD v0.2 的原顺序，理由见[设计文档 §1.1](docs/superpowers/specs/2026-08-29-goule-phase1-design.md)。

## 开源协议

MIT License，见 [LICENSE](LICENSE)。
