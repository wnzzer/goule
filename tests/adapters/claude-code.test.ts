import { expect, test } from 'bun:test'
import { statSync } from 'node:fs'
import { claudeCode, isHumanLine } from '../../src/adapters/claude-code'

const FIXTURE = 'tests/fixtures/claude-code-basic.jsonl'

test('真人谓词：普通 user 记录算真人', () => {
  const line = '{"type":"user","userType":"external","isSidechain":false,"message":{"content":"hi"}}'
  expect(isHumanLine(line)).toBe(true)
})

test('真人谓词：tool_result 必须排除', () => {
  const line = '{"type":"user","userType":"external","isSidechain":false,"message":{"content":[{"type":"tool_result","content":"x"}]}}'
  expect(isHumanLine(line)).toBe(false)
})

test('真人谓词：subagent 记录必须排除', () => {
  const line = '{"type":"user","userType":"external","isSidechain":true,"message":{"content":"x"}}'
  expect(isHumanLine(line)).toBe(false)
})

test('真人谓词：assistant 记录不是真人', () => {
  const line = '{"type":"assistant","timestamp":"2026-08-29T01:00:00.000Z"}'
  expect(isHumanLine(line)).toBe(false)
})

test('parse 提取元数据与事件', async () => {
  const s = await claudeCode.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s).not.toBeNull()
  expect(s!.tool).toBe('claude-code')
  expect(s!.id).toBe('aaaa-1111')
  expect(s!.cwd).toBe('/Users/tester/work/acme-api')
  expect(s!.git?.branch).toBe('main')
  expect(s!.title).toBe('重构扫描器')
  expect(s!.isSidechain).toBe(false)
})

test('parse 只把 3 条中的 2 条真正的 user 记录算作 human', async () => {
  const s = await claudeCode.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  const human = s!.events.filter((e) => e.kind === 'human')
  // 5 条带 timestamp 的记录中：user 3 条，但 tool_result 与 sidechain 各排除 1 条
  expect(human).toHaveLength(2)
  expect(s!.events).toHaveLength(5)
})

test('parse 对不含时间戳的文件返回 null', async () => {
  const p = '/tmp/goule-empty.jsonl'
  await Bun.write(p, '{"type":"ai-title","aiTitle":"x","sessionId":"y"}\n')
  const s = await claudeCode.parse({ file: p, mtimeMs: Date.now() })
  expect(s).toBeNull()
})
