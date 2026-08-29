import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { GOULE_DIR } from '../types/config'
import { emptyMouseActivity } from './aggregate'
import type { MouseActivity, MouseActivityRecord, MouseProvider } from './types'

function activityDir(root: string): string {
  return join(root, 'activity')
}

export function mouseActivityPath(dayId: string, root = GOULE_DIR): string {
  return join(activityDir(root), `${dayId}.json`)
}

function validRecord(value: unknown, dayId: string): value is MouseActivityRecord {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<MouseActivityRecord>
  return (
    v.schemaVersion === 1 && v.dayId === dayId &&
    typeof v.clicks === 'number' && Number.isFinite(v.clicks) && v.clicks >= 0 &&
    Array.isArray(v.byHour) && v.byHour.length === 24 &&
    v.byHour.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
    typeof v.observedMinutes === 'number' && Number.isFinite(v.observedMinutes) && v.observedMinutes >= 0 &&
    (v.coverage === 'complete' || v.coverage === 'partial' || v.coverage === 'unavailable') &&
    (v.provider === 'macos-cgevent' || v.provider === 'linux-evdev' || v.provider === 'activitywatch') &&
    typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt)
  )
}

export function readMouseRecord(dayId: string, root = GOULE_DIR): MouseActivityRecord | null {
  const path = mouseActivityPath(dayId, root)
  if (!existsSync(path)) return null
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return validRecord(value, dayId) ? value : null
  } catch {
    return null
  }
}

/** 原子写入聚合文件，避免 scan 读到半截 JSON。 */
export async function writeMouseRecordAsync(record: MouseActivityRecord, root = GOULE_DIR): Promise<void> {
  const dir = activityDir(root)
  mkdirSync(dir, { recursive: true })
  try { chmodSync(dir, 0o700) } catch { /* 权限由宿主文件系统决定 */ }
  const path = mouseActivityPath(record.dayId, root)
  const tmp = `${path}.${process.pid}.tmp`
  await Bun.write(tmp, JSON.stringify(record, null, 2) + '\n')
  renameSync(tmp, path)
  try { chmodSync(path, 0o600) } catch { /* 权限由宿主文件系统决定 */ }
}

export function loadMouseActivity(
  dayId: string,
  enabled: boolean,
  provider: MouseProvider | null,
  root = GOULE_DIR,
): MouseActivity {
  const record = readMouseRecord(dayId, root)
  if (record) {
    return {
      enabled: true,
      clicks: record.clicks,
      byHour: [...record.byHour],
      observedMinutes: record.observedMinutes,
      coverage: record.coverage,
      provider: record.provider,
    }
  }
  return emptyMouseActivity(enabled, provider)
}
