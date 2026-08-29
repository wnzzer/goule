#!/usr/bin/env bun

const command = Bun.argv[2] ?? "help";

const help = `够了·到点下班（Goule）\n\nPhase 1（事实层）：\n  goule report [--date today] [--format md|json] [--polish] [--dry-run]\n  goule scan   [--date today]     输出原始 DayFacts JSON\n  goule notes  [--date today]     用 $EDITOR 编辑当日笔记\n  goule doctor                    数据源可达性诊断\n\nPhase 2（规则引擎，尚未实现）：\n  goule init / check / rules / dashboard\n\n当前版本：项目骨架（Spec-First）\n设计文档：docs/superpowers/specs/2026-08-29-goule-phase1-design.md\n`;

const phase2 = (name: string) =>
  console.error(`\`goule ${name}\` 属于 Phase 2（规则引擎），尚未实现。\n首期只呈现事实，不下结论 —— 试试 \`goule report\`。`);

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(help);
    break;
  case "report":
    console.log("Goule 日报渲染器即将实现。");
    break;
  case "scan":
    console.log("Goule session + Git 扫描器即将实现。");
    break;
  case "notes":
    console.log("Goule 笔记编辑即将实现。数据目录：~/.goule/notes/");
    break;
  case "doctor":
    console.log("Goule 数据源诊断即将实现。检查 ~/.claude/projects 与 ~/.codex/sessions");
    break;
  case "init":
  case "check":
  case "rules":
  case "dashboard":
    phase2(command);
    process.exitCode = 1;
    break;
  default:
    console.error(`未知命令：${command}\n`);
    process.stdout.write(help);
    process.exitCode = 1;
}
