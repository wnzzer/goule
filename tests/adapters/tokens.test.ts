import { expect, test } from 'bun:test'
import { statSync } from 'node:fs'
import { claudeCode } from '../../src/adapters/claude-code'
import { codex } from '../../src/adapters/codex'
import {
  addTokens, diffTokens, emptyTokens, sumTokens, totalTokens,
} from '../../src/types/session'

const CC = 'tests/fixtures/claude-code-tokens.jsonl'
const CX = 'tests/fixtures/codex-tokens.jsonl'

const parse = (a: typeof claudeCode, f: string) =>
  a.parse({ file: f, mtimeMs: statSync(f).mtimeMs })

test('Claude Code：usage 按 message.id 去重，不重复计数', async () => {
  const s = await parse(claudeCode, CC)
  // msg_a 落盘两次只算一次：input 10+5，output 100+50
  expect(sumTokens(s!.tokenEvents)).toEqual({
    input: 15, output: 150, cacheRead: 3000, cacheWrite: 200, reasoning: 60,
  })
})

test('Claude Code：每条 usage 是一个带时间戳的增量事件', async () => {
  const s = await parse(claudeCode, CC)
  expect(s!.tokenEvents).toHaveLength(2)
  expect(s!.tokenEvents[0]!.at).toBeLessThan(s!.tokenEvents[1]!.at)
})

test('Claude Code：没有 usage 的行不影响统计', async () => {
  const s = await parse(claudeCode, CC)
  expect(totalTokens(sumTokens(s!.tokenEvents))).toBe(15 + 150 + 3000 + 200)
})

test('Codex：累计快照转增量，不相加', async () => {
  const s = await parse(codex, CX)
  // 两条快照：20411/8000/100/156/40 → 30000/12000/500/900/300
  // 相加会得到 input 30411；正确的增量合计等于最后一条快照
  expect(sumTokens(s!.tokenEvents)).toEqual({
    input: 18000, output: 900, cacheRead: 12000, cacheWrite: 500, reasoning: 300,
  })
})

test('Codex：input 减去 cached_input_tokens，与 CC 口径一致', async () => {
  const s = await parse(codex, CX)
  const first = s!.tokenEvents[0]!.usage
  expect(first.input).toBe(20411 - 8000)
  expect(first.cacheRead).toBe(8000)
})

test('无 usage 记录的 session：tokenEvents 为空', async () => {
  const s = await parse(claudeCode, 'tests/fixtures/claude-code-basic.jsonl')
  expect(s!.tokenEvents).toEqual([])
  expect(sumTokens(s!.tokenEvents)).toEqual(emptyTokens())
})

test('按时间区间求和：只算落在区间内的事件', async () => {
  const s = await parse(claudeCode, CC)
  const [a, b] = s!.tokenEvents
  expect(sumTokens(s!.tokenEvents, a!.at, b!.at)).toEqual(a!.usage)
  expect(sumTokens(s!.tokenEvents, b!.at)).toEqual(b!.usage)
})

test('addTokens 逐字段相加，emptyTokens 是幺元', () => {
  const a = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, reasoning: 5 }
  expect(addTokens(a, emptyTokens())).toEqual(a)
  expect(addTokens(a, a)).toEqual({ input: 2, output: 4, cacheRead: 6, cacheWrite: 8, reasoning: 10 })
})

test('diffTokens 在 0 处截断：上下文压缩会让累计值回落', () => {
  const small = { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, reasoning: 1 }
  const big = { input: 9, output: 9, cacheRead: 9, cacheWrite: 9, reasoning: 9 }
  expect(diffTokens(small, big)).toEqual(emptyTokens())
})

test('totalTokens 不重复计入 reasoning（已含在 output 内）', () => {
  expect(totalTokens({ input: 1, output: 10, cacheRead: 100, cacheWrite: 1000, reasoning: 7 }))
    .toBe(1111)
})
