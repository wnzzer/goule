import { dayRange, logicalDay, type DayRange } from '../types/day'
import { localHour, type Instant, type Tz } from '../types/instant'
import type { MouseActivity, MouseActivityRecord, MouseClickEvent, MouseProvider } from './types'

export function emptyMouseActivity(
  enabled = false,
  provider: MouseProvider | null = null,
): MouseActivity {
  return {
    enabled,
    clicks: 0,
    byHour: new Array<number>(24).fill(0),
    observedMinutes: 0,
    coverage: 'unavailable',
    provider,
  }
}

function emptyRecord(dayId: string, provider: MouseProvider): MouseActivityRecord {
  return {
    schemaVersion: 1,
    dayId,
    clicks: 0,
    byHour: new Array<number>(24).fill(0),
    observedMinutes: 0,
    coverage: 'partial',
    provider,
    updatedAt: Date.now(),
  }
}

function recordToActivity(record: MouseActivityRecord): MouseActivity {
  return {
    enabled: true,
    clicks: record.clicks,
    byHour: [...record.byHour],
    observedMinutes: record.observedMinutes,
    coverage: record.coverage,
    provider: record.provider,
  }
}

/** 把一组 click event 聚合到指定逻辑日；不会保存原始事件。 */
export function aggregateMouseClicks(
  events: MouseClickEvent[],
  range: DayRange,
  tz: Tz,
  provider: MouseProvider = 'activitywatch',
  observedMinutes = 0,
): MouseActivity {
  const record = emptyRecord(range.dayId, provider)
  record.observedMinutes = Math.max(0, observedMinutes)
  for (const event of events) {
    if (!Number.isFinite(event.at) || event.at < range.start || event.at >= range.end) continue
    record.clicks += 1
    const hour = localHour(event.at, tz)
    record.byHour[hour] = (record.byHour[hour] ?? 0) + 1
  }
  return recordToActivity(record)
}

/** 向按日状态中加入一个点击。用于后台 collector，内存中不保留事件序列。 */
export class DailyMouseAccumulator {
  private readonly records = new Map<string, MouseActivityRecord>()

  constructor(
    private readonly cutoffHour: number,
    private readonly tz: Tz,
    private readonly provider: MouseProvider,
  ) {}

  addClick(event: MouseClickEvent): void {
    if (!Number.isFinite(event.at)) return
    const dayId = logicalDay(event.at, this.cutoffHour, this.tz)
    const record = this.get(dayId)
    const hour = localHour(event.at, this.tz)
    record.clicks += 1
    record.byHour[hour] = (record.byHour[hour] ?? 0) + 1
    record.updatedAt = Date.now()
  }

  load(record: MouseActivityRecord): void {
    if (record.provider !== this.provider) return
    this.records.set(record.dayId, {
      ...record,
      byHour: [...record.byHour],
    })
  }

  /** 记录 collector 实际运行覆盖时长，并按逻辑日边界拆分。 */
  addObserved(from: Instant, to: Instant): void {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return
    let cursor = from
    while (cursor < to) {
      const dayId = logicalDay(cursor, this.cutoffHour, this.tz)
      const range = dayRange(dayId, this.cutoffHour, this.tz)
      const end = Math.min(to, range.end)
      const record = this.get(dayId)
      record.observedMinutes = Math.min(24 * 60, record.observedMinutes + (end - cursor) / 60_000)
      record.coverage = record.observedMinutes >= 24 * 60 ? 'complete' : 'partial'
      record.updatedAt = Date.now()
      cursor = end
    }
  }

  snapshot(dayId: string): MouseActivity | null {
    const record = this.records.get(dayId)
    return record ? recordToActivity(record) : null
  }

  recordsToWrite(): MouseActivityRecord[] {
    return [...this.records.values()].map((record) => ({
      ...record,
      byHour: [...record.byHour],
    }))
  }

  private get(dayId: string): MouseActivityRecord {
    let record = this.records.get(dayId)
    if (!record) {
      record = emptyRecord(dayId, this.provider)
      this.records.set(dayId, record)
    }
    return record
  }
}
