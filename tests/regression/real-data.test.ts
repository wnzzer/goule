import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { DEFAULT_CONFIG, resolveTz } from '../../src/types/config'
import { logicalDay } from '../../src/types/day'
import { scanDay } from '../../src/scan'

const hasRealData =
  existsSync(DEFAULT_CONFIG.sources.claudeCode.root) ||
  existsSync(DEFAULT_CONFIG.sources.codex.root)

test.skipIf(!hasRealData)('真实数据：hands_on 必须显著小于 agent', async () => {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const day = logicalDay(Date.now() - 86_400_000, DEFAULT_CONFIG.dayCutoffHour, tz)
  const facts = await scanDay(day, DEFAULT_CONFIG)

  // 实测真人输入仅占全部记录的 8.89%。若 hands_on 接近 agent，
  // 说明真人谓词退化（例如漏排除 tool_result），这是必须捕获的回归。
  if (facts.activity.agent.minutes > 60) {
    expect(facts.activity.handsOn.minutes).toBeLessThan(facts.activity.agent.minutes)
  }
}, 120_000)

test.skipIf(!hasRealData)('真实数据：单日 hands_on 不应超过 16 小时', async () => {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const day = logicalDay(Date.now() - 86_400_000, DEFAULT_CONFIG.dayCutoffHour, tz)
  const facts = await scanDay(day, DEFAULT_CONFIG)
  expect(facts.activity.handsOn.minutes).toBeLessThan(16 * 60)
}, 120_000)

test.skipIf(!hasRealData)('真实数据：signals 恒为 7 条，debt 落在 [0,1]', async () => {
  const tz = resolveTz(DEFAULT_CONFIG.timezone)
  const day = logicalDay(Date.now() - 86_400_000, DEFAULT_CONFIG.dayCutoffHour, tz)
  const facts = await scanDay(day, DEFAULT_CONFIG)
  expect(facts.stress.signals).toHaveLength(7)
  expect(facts.stress.debt).toBeGreaterThanOrEqual(0)
  expect(facts.stress.debt).toBeLessThanOrEqual(1)
}, 120_000)
