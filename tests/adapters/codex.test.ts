import { expect, test } from 'bun:test'
import { statSync } from 'node:fs'
import { codex, isHumanLine } from '../../src/adapters/codex'

const FIXTURE = 'tests/fixtures/codex-basic.jsonl'

test('真人谓词：role user 算真人', () => {
  expect(isHumanLine('{"payload":{"role":"user","type":"message"}}')).toBe(true)
})

test('真人谓词：role developer 不算', () => {
  expect(isHumanLine('{"payload":{"role":"developer","type":"message"}}')).toBe(false)
})

test('真人谓词：role assistant 不算', () => {
  expect(isHumanLine('{"payload":{"role":"assistant","type":"message"}}')).toBe(false)
})

test('parse 从 session_meta 提取元数据', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s).not.toBeNull()
  expect(s!.tool).toBe('codex')
  expect(s!.id).toBe('bbbb-2222')
  expect(s!.cwd).toBe('/Users/tester/work/acme-api')
  expect(s!.git?.branch).toBe('master')
  expect(s!.git?.commitHash).toBe('a38f3836ec7c2e5eecfa3cd4a07e57b524c86eb1')
})

test('Codex 无 aiTitle，title 恒为 null', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s!.title).toBeNull()
})

test('7 条记录中只有 2 条 role=user 算 human', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s!.events).toHaveLength(7)
  expect(s!.events.filter((e) => e.kind === 'human')).toHaveLength(2)
})

test('Codex session 不是 sidechain', async () => {
  const s = await codex.parse({ file: FIXTURE, mtimeMs: statSync(FIXTURE).mtimeMs })
  expect(s!.isSidechain).toBe(false)
  expect(s!.parentSessionId).toBeNull()
})
