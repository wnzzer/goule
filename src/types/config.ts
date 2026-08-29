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
  /** 递归扫描这些目录下的 Git 工作树。 */
  repos: string[]
  /** auto 使用每个仓库的 git config user.email；也可显式指定 author 匹配串。 */
  author: 'auto' | string
  /** 默认不把 merge commit 计入日报，但保留该开关以便审计。 */
  excludeMerge: boolean
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
  mouse: MouseConfig
  git: GitConfig
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
  mouse: {
    enabled: false,
    provider: 'auto',
    persist: true,
  },
  git: {
    // 没有配置加载器前，默认扫描启动 CLI 时所在的仓库；非 Git 目录会自动忽略。
    repos: [process.cwd()],
    author: 'auto',
    excludeMerge: true,
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
