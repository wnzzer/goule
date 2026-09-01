#!/usr/bin/env node

import { generatePrototypeFixture } from '../src/prototype/fixture'

const summary = await generatePrototypeFixture(
  process.argv[2],
  process.argv[3],
  Number(process.argv[4] ?? 7),
)

console.log(
  `已写入 ${summary.out}\n`
  + `  归档 ${summary.archiveDays} 天 · 当前 ${summary.sessions} 个 session · ${summary.commits} 条 commit`
  + ` · 动手 ${Math.round(summary.handMinutes)}m · 鼠标 ${summary.mouseClicks === null ? '未开启' : `${summary.mouseClicks} 次`}`,
)
