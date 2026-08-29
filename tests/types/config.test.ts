import { expect, test } from 'bun:test'
import { DEFAULT_CONFIG, resolveTz } from '../../src/types/config'

test('默认逻辑日 cutoff 为 04:00', () => {
  expect(DEFAULT_CONFIG.dayCutoffHour).toBe(4)
})

test('默认 idle 阈值 10 分钟', () => {
  expect(DEFAULT_CONFIG.idleGapMinutes).toBe(10)
})

test('压力债半衰期默认 3 天', () => {
  expect(DEFAULT_CONFIG.stress.halfLifeDays).toBe(3)
})

test('基线冷启动门槛 14 天', () => {
  expect(DEFAULT_CONFIG.stress.baselineMinDays).toBe(14)
})

test('resolveTz 对 auto 返回系统时区', () => {
  expect(resolveTz('auto')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
})

test('resolveTz 透传显式时区', () => {
  expect(resolveTz('Asia/Shanghai')).toBe('Asia/Shanghai')
})

test('GOULE_TZ 覆盖 auto 和显式配置', () => {
  const before = process.env.GOULE_TZ
  process.env.GOULE_TZ = 'UTC'
  try {
    expect(resolveTz('auto')).toBe('UTC')
    expect(resolveTz('Asia/Shanghai')).toBe('UTC')
  } finally {
    if (before === undefined) delete process.env.GOULE_TZ
    else process.env.GOULE_TZ = before
  }
})

test('鼠标采集默认关闭且启用持久化', () => {
  expect(DEFAULT_CONFIG.mouse.enabled).toBe(false)
  expect(DEFAULT_CONFIG.mouse.persist).toBe(true)
})
