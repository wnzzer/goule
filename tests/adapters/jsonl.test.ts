import { expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLines, firstTimestamp } from '../../src/adapters/jsonl'

function tmpFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'goule-'))
  const p = join(dir, 'a.jsonl')
  writeFileSync(p, content)
  return p
}

test('readLines 逐行产出，跳过空行', async () => {
  const p = tmpFile('{"a":1}\n\n{"b":2}\n')
  const out: string[] = []
  for await (const line of readLines(p)) out.push(line)
  expect(out).toEqual(['{"a":1}', '{"b":2}'])
})

test('readLines 处理无尾换行的最后一行', async () => {
  const p = tmpFile('{"a":1}\n{"b":2}')
  const out: string[] = []
  for await (const line of readLines(p)) out.push(line)
  expect(out).toEqual(['{"a":1}', '{"b":2}'])
})

test('readLines 处理跨 chunk 的长行', async () => {
  const big = 'x'.repeat(300_000)
  const p = tmpFile(`{"v":"${big}"}\n{"b":2}\n`)
  const out: string[] = []
  for await (const line of readLines(p)) out.push(line)
  expect(out).toHaveLength(2)
  expect(out[0]!.length).toBe(300_000 + 8)
})

test('firstTimestamp 取每行第一个匹配（实测 100% 准确）', () => {
  const line = '{"timestamp":"2026-08-29T01:36:35.902Z","ordinal":0}'
  expect(firstTimestamp(line)).toBe(Date.parse('2026-08-29T01:36:35.902Z'))
})

test('firstTimestamp 在正文含时间戳时仍取顶层的那个', () => {
  const line = '{"timestamp":"2026-08-29T01:00:00.000Z","message":{"content":"看这段 \\"timestamp\\":\\"2020-01-01T00:00:00.000Z\\""}}'
  expect(firstTimestamp(line)).toBe(Date.parse('2026-08-29T01:00:00.000Z'))
})

test('firstTimestamp 无匹配返回 null', () => {
  expect(firstTimestamp('{"type":"ai-title","aiTitle":"x"}')).toBeNull()
})

test('firstTimestamp 容忍键后空格', () => {
  expect(firstTimestamp('{"timestamp": "2026-08-29T01:00:00.000Z"}'))
    .toBe(Date.parse('2026-08-29T01:00:00.000Z'))
})
