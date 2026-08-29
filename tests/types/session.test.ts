import { expect, test } from 'bun:test'
import { humanTimes, agentTimes, type RawSession } from '../../src/types/session'

const base: RawSession = {
  id: 's1', tool: 'claude-code', file: '/tmp/s1.jsonl',
  events: [
    { at: 100, kind: 'human' },
    { at: 200, kind: 'agent' },
    { at: 300, kind: 'human' },
  ],
  cwd: '/repo', git: null, title: null,
  tokenEvents: [],
  isSidechain: false, parentSessionId: null,
}

test('humanTimes 只取真人事件', () => {
  expect(humanTimes(base)).toEqual([100, 300])
})

test('agentTimes 取全部事件（agent 时长是全量口径的上界）', () => {
  expect(agentTimes(base)).toEqual([100, 200, 300])
})

test('无事件时返回空数组', () => {
  expect(humanTimes({ ...base, events: [] })).toEqual([])
})
