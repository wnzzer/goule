import type { Instant } from '../types/instant'

/** 只保留聚合后的鼠标点击活动，不保存坐标、窗口或设备信息。 */
export interface MouseClickEvent {
  at: Instant
}

export type MouseProvider = 'macos-cgevent' | 'linux-evdev' | 'activitywatch'
export type MouseCoverage = 'complete' | 'partial' | 'unavailable'

/**
 * 鼠标点击是独立活动证据，不是 hands_on 工时。
 * byHour 是本地小时桶，clicks 是 button-down 次数。
 */
export interface MouseActivity {
  enabled: boolean
  clicks: number
  byHour: number[]
  observedMinutes: number
  coverage: MouseCoverage
  provider: MouseProvider | null
}

export interface MouseActivityRecord {
  schemaVersion: 1
  dayId: string
  clicks: number
  byHour: number[]
  observedMinutes: number
  coverage: MouseCoverage
  provider: MouseProvider
  updatedAt: Instant
}
