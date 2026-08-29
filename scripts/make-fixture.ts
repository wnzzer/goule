#!/usr/bin/env bun
/**
 * 从真实 session 文件生成脱敏 fixture。
 * 保留：type / timestamp / 结构骨架 / 角色标记 / 路径形状
 * 剥除：message.content、tool 参数与结果、base_instructions、思维链
 *
 * 用法: bun run scripts/make-fixture.ts <真实文件> <输出路径> [最多行数]
 */
import { readLines } from '../src/adapters/jsonl'

const SENSITIVE_KEYS = new Set([
  'content', 'text', 'input', 'output', 'arguments', 'result',
  'base_instructions', 'reasoning', 'summary', 'thinking',
  'repository_url', 'remoteUrl',
])

function scrub(node: unknown, depth = 0): unknown {
  if (depth > 12) return null
  if (Array.isArray(node)) return node.map((x) => scrub(x, depth + 1))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = typeof v === 'string' ? `<scrubbed:${v.length}>` : '<scrubbed>'
      } else if (k === 'cwd' || k === 'file' || k === 'path') {
        out[k] = typeof v === 'string' ? v.replace(/\/Users\/[^/]+/, '/Users/tester') : v
      } else {
        out[k] = scrub(v, depth + 1)
      }
    }
    return out
  }
  return node
}

const [src, dst, maxRaw] = Bun.argv.slice(2)
if (!src || !dst) {
  console.error('用法: bun run scripts/make-fixture.ts <真实文件> <输出路径> [最多行数]')
  process.exit(1)
}
const max = maxRaw ? Number(maxRaw) : 500

const out: string[] = []
for await (const line of readLines(src)) {
  if (out.length >= max) break
  try {
    out.push(JSON.stringify(scrub(JSON.parse(line))))
  } catch {
    // 非 JSON 行直接丢弃，fixture 不需要它
  }
}
await Bun.write(dst, out.join('\n') + '\n')
console.log(`已写入 ${dst}（${out.length} 行，源 ${src}）`)
