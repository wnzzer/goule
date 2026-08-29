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

export interface MouseConfig {
  /** 默认关闭；显式执行 `goule activity start` 才会启动采集。 */
  enabled: boolean
  provider: 'auto' | 'macos-cgevent' | 'linux-evdev' | 'activitywatch'
  persist: boolean
}

export interface GitConfig {
  enabled: boolean
  /** session cwd 之外额外扫描的仓库根 */
  extraRepos: string[]
  /** 为空则每个仓库回退到自己的 user.email */
  authorEmails: string[]
}

export interface Config {
  dayCutoffHour: number
  idleGapMinutes: number
  minBlockCreditSeconds: number
  timezone: string
  sources: {
    claudeCode: { enabled: boolean; root: string }
    codex: { enabled: boolean; root: string }
    git: GitConfig
  }
  mouse: MouseConfig
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
    git: { enabled: true, extraRepos: [], authorEmails: [] },
  },
  mouse: {
    enabled: false,
    provider: 'auto',
    persist: true,
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
  if (process.env.GOULE_TZ) return process.env.GOULE_TZ
  if (timezone === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone
  return timezone
}

export const GOULE_DIR = join(homedir(), '.goule')
