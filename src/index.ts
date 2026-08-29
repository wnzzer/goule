#!/usr/bin/env bun

const command = Bun.argv[2] ?? "help";

const help = `够了·到点下班（Goule）\n\n用法：\n  goule init\n  goule scan [--date today]\n  goule check\n  goule report [--mode daily]\n  goule dashboard\n  goule rules edit\n\n当前版本：项目骨架（Spec-First）\n`;

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(help);
    break;
  case "init":
    console.log("Goule 初始化流程即将实现。数据目录：~/.goule/");
    break;
  case "scan":
    console.log("Goule Git 扫描器即将实现。");
    break;
  case "check":
    console.log("✓ Goule 核验引擎即将实现 · 当前为项目骨架");
    break;
  case "report":
    console.log("Goule 日报渲染器即将实现。");
    break;
  case "dashboard":
    console.log("Goule Dashboard 即将实现。");
    break;
  case "rules":
    console.log("Goule 规则编辑器即将实现。");
    break;
  default:
    console.error(`未知命令：${command}\n`);
    process.stdout.write(help);
    process.exitCode = 1;
}
