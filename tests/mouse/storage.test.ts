import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMouseRecord, loadMouseActivity, mouseActivityPath, writeMouseRecordAsync } from '../../src/mouse/storage'

test('mouse 聚合文件可原子写入并读取', async () => {
  const root = mkdtempSync(join(tmpdir(), 'goule-mouse-'))
  const record = {
    schemaVersion: 1 as const,
    dayId: '2026-08-29',
    clicks: 42,
    byHour: new Array<number>(24).fill(0),
    observedMinutes: 120,
    coverage: 'partial' as const,
    provider: 'macos-cgevent' as const,
    updatedAt: Date.now(),
  }
  record.byHour[9] = 42

  await writeMouseRecordAsync(record, root)
  expect(readMouseRecord('2026-08-29', root)).toEqual(record)
  expect(loadMouseActivity('2026-08-29', false, null, root)).toMatchObject({ clicks: 42, enabled: true })
  expect(mouseActivityPath('2026-08-29', root)).toContain('/activity/2026-08-29.json')
})

test('不存在或损坏的文件不会被解释成有效点击数据', async () => {
  const root = mkdtempSync(join(tmpdir(), 'goule-mouse-'))
  await Bun.write(mouseActivityPath('2026-08-29', root), '{not-json}\n')
  const activity = loadMouseActivity('2026-08-29', true, 'macos-cgevent', root)
  expect(activity.clicks).toBe(0)
  expect(activity.coverage).toBe('unavailable')
})
