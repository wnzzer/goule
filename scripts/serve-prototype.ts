#!/usr/bin/env node

import { startDashboard } from '../src/dashboard'
import { DEFAULT_CONFIG, resolveTz } from '../src/types/config'
import { logicalDay } from '../src/types/day'

const port = Number(process.argv[2] ?? 8912)
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`端口需为 1–65535 的整数，收到：${process.argv[2] ?? ''}`)
}

const day = logicalDay(Date.now(), DEFAULT_CONFIG.dayCutoffHour, resolveTz(DEFAULT_CONFIG.timezone))
await startDashboard(day, port, false)
