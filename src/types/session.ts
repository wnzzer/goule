import type { Instant } from './instant'

export type ToolId = 'claude-code' | 'codex'

/**
 * human = 真人输入锚点，是唯一的工时依据。
 * agent = 模型/工具产生的记录。
 * 实测真人输入仅占全部记录的 8.89%，混算会让工时虚高 63%（单日最坏 7.3 倍）。
 */
export type EventKind = 'human' | 'agent'

export interface SessionEvent {
  at: Instant
  kind: EventKind
}

export interface SessionGit {
  branch: string | null
  commitHash: string | null
  remoteUrl: string | null
}

/**
 * 会话 token 用量。只读聚合计数，不读取任何对话内容。
 *
 * input 一律不含缓存命中：Codex 的 input_tokens 把 cached_input_tokens
 * 也算在内，落库前必须减掉。
 *
 * 但两个工具的 input 仍**不可直接横向比较**：Claude Code 把首次送入的内容
 * 计入 cache_creation（cacheWrite），input_tokens 只剩个位数；Codex 的
 * cache_write 恒为 0，新内容全落在 input。要谈「新写进去的东西」请用
 * freshInput()，不要单看 input。
 */
export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

export function emptyTokens(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

export function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    reasoning: a.reasoning + b.reasoning,
  }
}

/**
 * 计费口径总量。reasoning 已包含在 output 内，不再单独相加。
 * 展示时应分列 input / output / cache，只给一个总数会掩盖缓存命中的比例。
 */
export function totalTokens(t: TokenUsage): number {
  return t.input + t.output + t.cacheRead + t.cacheWrite
}

/**
 * 带时间戳的 token 增量。
 *
 * 必须建模成「事件」而不是「会话总量」：一个 session 文件可以跨多天，
 * 实测扫描窗口内有 276 个 session，把整份文件的 token 记到当天，
 * 就是把一个月的用量算成今天的产出。usage 为增量，不是累计值。
 */
export interface TokenEvent {
  at: Instant
  usage: TokenUsage
}

/**
 * 未命中缓存的输入量。
 *
 * **不是「你新写了多少」**：每一轮都要重发上下文，没被缓存的部分会反复计入。
 * 实测某日 Codex 侧该值达 33M，而当日真人输入只有 2h35m —— 它衡量的是
 * 送进模型的字节，不是产出。真正「今天生产了什么」只能看 output。
 */
export function uncachedInput(t: TokenUsage): number {
  return t.input + t.cacheWrite
}

/** 求和；给定 [from, to) 时只统计落在区间内的事件。 */
export function sumTokens(events: TokenEvent[], from?: Instant, to?: Instant): TokenUsage {
  let acc = emptyTokens()
  for (const e of events) {
    if (from !== undefined && e.at < from) continue
    if (to !== undefined && e.at >= to) continue
    acc = addTokens(acc, e.usage)
  }
  return acc
}

/** 逐字段相减并在 0 处截断。Codex 上下文压缩会让累计值回落。 */
export function diffTokens(curr: TokenUsage, prev: TokenUsage): TokenUsage {
  return {
    input: Math.max(0, curr.input - prev.input),
    output: Math.max(0, curr.output - prev.output),
    cacheRead: Math.max(0, curr.cacheRead - prev.cacheRead),
    cacheWrite: Math.max(0, curr.cacheWrite - prev.cacheWrite),
    reasoning: Math.max(0, curr.reasoning - prev.reasoning),
  }
}

export interface RawSession {
  id: string
  tool: ToolId
  file: string
  events: SessionEvent[]
  cwd: string | null
  /** Codex 全有；CC 只有 branch */
  git: SessionGit | null
  /** CC 的 aiTitle；Codex 恒为 null，交给润色层补 */
  title: string | null
  /** 带时间戳的 token 增量；无 usage 记录时为空数组 */
  tokenEvents: TokenEvent[]
  isSidechain: boolean
  parentSessionId: string | null
}

export function humanTimes(s: RawSession): Instant[] {
  return s.events.filter((e) => e.kind === 'human').map((e) => e.at)
}

/** 全部事件时间。agent 块以此为锚点，再减去 hands_on 部分。 */
export function agentTimes(s: RawSession): Instant[] {
  return s.events.map((e) => e.at)
}
