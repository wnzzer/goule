# 够了·到点下班（Goule）

> **Enough, clock out.**

本地优先的「今日工作核验 + 日报双模」工具：读取 Git 与可选行为数据，按你自己定义的规则告诉你**够了没有**，并生成可复制的证据页。

## 状态

🚧 Proposal / Spec-First：产品方向已冻结，MVP 正在拆解实现。

## 核心原则

- **Local-first**：默认无账号、无遥测，数据保存在 `~/.goule/`。
- **Evidence over vibe**：红绿灯只由可审计规则决定，AI 不参与 verdict。
- **Rules you own**：规则由用户拥有和配置，不硬编码“996 标准”。
- **Dual face**：同一份数据支持收工核验和日报输出。
- **No keylogger**：不记录源码、按键内容或 IM 正文。

## 快速开始（开发中）

需要 [Bun](https://bun.sh/) 1.1+ 和 Git 2.30+：

```bash
bun install
bun run dev -- check
```

当前骨架提供安全的 CLI 入口；Git 扫描、SQLite、规则引擎和 Dashboard 将按 `docs/PRD.md` 逐步实现。

## 品牌文案

| Verdict | 文案 |
| --- | --- |
| `GO` | **够了，到点下班** |
| `CAUTION` | **差不多，你说了算** |
| `NO_GO` | **证据还差点，再补一块** |

## 规划

- v0.1：本地 Git、多 repo、SQLite、规则引擎、`check`、日报、Dashboard
- v0.2：ActivityWatch、飞书元数据、可选 AI 日报润色、规则市场
- v0.3：Agent session 导入、周报、定时提醒

详见 [产品需求文档](docs/PRD.md)。

## 开源协议

MIT License，见 [LICENSE](LICENSE)。
