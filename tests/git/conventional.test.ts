import { expect, test } from 'bun:test'
import { parseConventional } from '../../src/git/conventional'

test('标准 type: subject', () => {
  expect(parseConventional('feat: 加入收工刻度')).toEqual({
    type: 'feat', scope: null, breaking: false, description: '加入收工刻度',
  })
})

test('带 scope', () => {
  expect(parseConventional('fix(scan): 修正逻辑日边界')).toEqual({
    type: 'fix', scope: 'scan', breaking: false, description: '修正逻辑日边界',
  })
})

test('感叹号标记 breaking change', () => {
  expect(parseConventional('refactor(api)!: 移除 v1 端点')).toEqual({
    type: 'refactor', scope: 'api', breaking: true, description: '移除 v1 端点',
  })
})

test('大小写不敏感，type 归一为小写', () => {
  expect(parseConventional('FEAT: x').type).toBe('feat')
})

test('非规范提交：type 为 null，描述保留原样', () => {
  expect(parseConventional('update')).toEqual({
    type: null, scope: null, breaking: false, description: 'update',
  })
})

test('未知 type 不冒充规范提交', () => {
  expect(parseConventional('wip: 随手存一下').type).toBeNull()
})

test('冒号后必须有空格，避免把 URL 之类误判', () => {
  expect(parseConventional('fix:no-space').type).toBeNull()
  expect(parseConventional('see https://x.dev: 说明').type).toBeNull()
})

test('revert 与 merge 提交', () => {
  expect(parseConventional('revert: feat: 加入收工刻度').type).toBe('revert')
  expect(parseConventional("Merge pull request #1 from x/y").type).toBeNull()
})
