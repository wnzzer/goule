#!/usr/bin/env bun

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Glob } from 'bun'
import { DEFAULT_CONFIG, resolveTz } from './types/config'
import { logicalDay } from './types/day'
import { activityStatus, startActivity, stopActivity } from './mouse/service'
import { scanDay } from './scan'
import { renderReport } from './render/report'
import { renderHtmlReport } from './render/html'
import { renderPdfReport } from './render/pdf'
import { renderSharePng, renderShareSvg } from './render/share'

const command = Bun.argv[2] ?? "help";

const help = `够了·到点下班（Goule）\n\nPhase 1（事实层）：\n  goule report [--date today] [--format md|json|html|pdf|share|svg] [--output path]\n  goule scan   [--date today]     输出原始 DayFacts JSON\n  goule notes  [--date today]     用 $EDITOR 编辑当日笔记\n  goule doctor                    数据源可达性诊断\n  goule activity start|stop|status  鼠标点击活动采集（默认关闭）\n\n导出示例：\n  goule report --format html --output report.html\n  goule report --format pdf --output report.pdf\n  goule report --format share --output goule-share.png\n\nPhase 2（规则引擎，尚未实现）：\n  goule init / check / rules / dashboard\n\n当前版本：项目骨架（Spec-First）\n设计文档：docs/superpowers/specs/2026-08-29-goule-phase1-design.md\n`;

const phase2 = (name: string) =>
  console.error(`\`goule ${name}\` 属于 Phase 2（规则引擎），尚未实现。\n首期只呈现事实，不下结论 —— 试试 \`goule report\`。`);

function argValue(flag: string): string | null {
  const i = Bun.argv.indexOf(flag)
  return i >= 0 ? (Bun.argv[i + 1] ?? null) : null
}

function targetDay(): string {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const raw = argValue('--date')
  if (raw === null || raw === 'today') {
    return logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, tz)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error(`--date 需为 YYYY-MM-DD 或 today，收到：${raw}`)
    process.exit(1)
  }
  return raw
}

async function countJsonl(root: string, pattern: string): Promise<number> {
  let n = 0
  const glob = new Glob(pattern)
  for await (const _ of glob.scan({ cwd: root, absolute: true, onlyFiles: true })) n++
  return n
}

type ReportFormat = 'md' | 'json' | 'html' | 'pdf' | 'share' | 'svg'

function defaultReportPath(dayId: string, format: ReportFormat): string {
  const suffix = format === 'share' ? 'png' : format
  return resolve(`goule-report-${dayId}.${suffix}`)
}

async function writeReportOutput(path: string, content: string | Uint8Array): Promise<void> {
  const target = resolve(path)
  mkdirSync(dirname(target), { recursive: true })
  await Bun.write(target, content)
  console.error(`已导出：${target}`)
}

async function doctor(): Promise<void> {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  console.log(`时区        ${tz}`)
  console.log(`逻辑日切点  ${DEFAULT_CONFIG.dayCutoffHour}:00`)
  console.log(`今日        ${logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, tz)}`)
  console.log('')

  const rows: Array<[string, string, string]> = []
  for (const [name, src, pattern] of [
    ['Claude Code', DEFAULT_CONFIG.sources.claudeCode, '**/*.jsonl'],
    ['Codex', DEFAULT_CONFIG.sources.codex, '*/*/*/*.jsonl'],
  ] as const) {
    if (!src.enabled) { rows.push([name, '已禁用', src.root]); continue }
    if (!existsSync(src.root)) { rows.push([name, '✗ 目录不存在', src.root]); continue }
    try {
      statSync(src.root)
      const n = await countJsonl(src.root, pattern)
      rows.push([name, `✓ ${n} 个 session 文件`, src.root])
    } catch (e) {
      rows.push([name, `✗ 不可读：${(e as Error).message}`, src.root])
    }
  }
  for (const [name, status, root] of rows) {
    console.log(`${name.padEnd(12)}${status.padEnd(26)}${root}`)
  }
  const mouse = activityStatus(DEFAULT_CONFIG)
  console.log('')
  console.log(`鼠标采集    ${mouse.running ? `✓ 运行中（pid ${mouse.pid}）` : '未运行'}`)
  console.log(`今日点击    ${mouse.clicks} 次（${mouse.coverage}）`)
}

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(help);
    break;
  case "report":
    {
      const format = argValue('--format') ?? 'md'
      if (!['md', 'json', 'html', 'pdf', 'share', 'svg'].includes(format)) {
        console.error(`--format 需为 md、json、html、pdf、share 或 svg，收到：${format}`)
        process.exitCode = 1
        break
      }
      if (Bun.argv.includes('--polish') || Bun.argv.includes('--dry-run')) {
        console.error('polish / dry-run 尚未实现；当前 report 仅输出事实层。')
        process.exitCode = 1
        break
      }
      const dayId = targetDay()
      const facts = await scanDay(dayId, DEFAULT_CONFIG)
      const output = argValue('--output')
      if (format === 'md' || format === 'json') {
        const content = format === 'json' ? `${JSON.stringify(facts, null, 2)}\n` : renderReport(facts)
        if (output) await writeReportOutput(output, content)
        else process.stdout.write(content)
      } else if (format === 'html') {
        const content = renderHtmlReport(facts)
        if (output) await writeReportOutput(output, content)
        else process.stdout.write(content)
      } else if (format === 'pdf') {
        await writeReportOutput(output ?? defaultReportPath(dayId, 'pdf'), await renderPdfReport(facts))
      } else if (format === 'svg') {
        await writeReportOutput(output ?? defaultReportPath(dayId, 'svg'), renderShareSvg(facts))
      } else {
        await writeReportOutput(output ?? defaultReportPath(dayId, 'share'), renderSharePng(facts))
      }
    }
    break;
  case "scan": {
    const facts = await scanDay(targetDay(), DEFAULT_CONFIG)
    process.stdout.write(JSON.stringify(facts, null, 2) + '\n')
    break;
  }
  case "notes":
    console.log("Goule 笔记编辑即将实现。数据目录：~/.goule/notes/");
    break;
  case "doctor":
    await doctor()
    break;
  case "activity": {
    const sub = Bun.argv[3] ?? 'status'
    try {
      if (sub === 'start') await startActivity(DEFAULT_CONFIG)
      else if (sub === 'stop') stopActivity()
      else if (sub === 'status') {
        const s = activityStatus(DEFAULT_CONFIG)
        console.log(`鼠标采集    ${s.running ? `运行中（pid ${s.pid}）` : '未运行'}`)
        console.log(`provider    ${s.provider ?? 'none'}`)
        console.log(`逻辑日      ${s.dayId}`)
        console.log(`今日点击    ${s.clicks} 次`)
        console.log(`覆盖状态    ${s.coverage}`)
      } else {
        throw new Error(`未知 activity 子命令：${sub}（可用 start、stop、status）`)
      }
    } catch (error) {
      console.error((error as Error).message)
      process.exitCode = 1
    }
    break
  }
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
