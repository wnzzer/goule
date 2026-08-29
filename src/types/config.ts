import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Tz } from './instant'

export interface StressConfig {
  halfLifeDays: number
  lateNightWindow: [number, number]
  lateNightMinutes: number
  shortRecoveryHours: number
  consecutiveDays: number
  weekendMinutes: number
  noBreakBlockMinutes: number
  baselineWindowDays: number
  baselineMinDays: number
}

export interface Config {
  dayCutoffHour: number
  idleGapMinutes: number
  minBlockCreditSeconds: number
  timezone: string
  sources: {
    claudeCode: { enabled: boolean; root: string }
    codex: { enabled: boolean; root: string }
  }
  stress: StressConfig
}

export const DEFAULT_CONFIG: Config = {
  dayCutoffHour: 4,
  idleGapMinutes: 10,
  minBlockCreditSeconds: 60,
  timezone: 'auto',
  sources: {
    claudeCode: { enabled: true, root: join(homedir(), '.claude', 'projects') },
    codex: { enabled: true, root: join(homedir(), '.codex', 'sessions') },
  },
  stress: {
    halfLifeDays: 3,
    lateNightWindow: [23, 6],
    lateNightMinutes: 30,
    shortRecoveryHours: 8,
    consecutiveDays: 6,
    weekendMinutes: 60,
    noBreakBlockMinutes: 120,
    baselineWindowDays: 30,
    baselineMinDays: 14,
  },
}

export function resolveTz(timezone: string): Tz {
  if (timezone === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone
  return timezone
}

export const GOULE_DIR = join(homedir(), '.goule')
