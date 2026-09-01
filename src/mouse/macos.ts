import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { packagePath } from '../runtime/paths'
import { GOULE_DIR } from '../types/config'
import type { MouseClickEvent } from './types'

const HELPER_NAME = 'goule-mouse-helper'
const HELPER_SOURCE = packagePath('native', 'macos', 'goule-mouse-helper.swift')

function decode(chunk: Uint8Array | string): string {
  return typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
}

/** 在第一次启动时编译 macOS 原生 helper，后续复用 ~/.goule/bin 中的产物。 */
export function ensureMacHelper(): string {
  if (process.platform !== 'darwin') {
    throw new Error('当前平台不是 macOS，CGEventTap collector 不可用')
  }
  if (!existsSync(HELPER_SOURCE)) {
    throw new Error(`找不到 macOS collector 源文件：${HELPER_SOURCE}`)
  }

  const binDir = join(GOULE_DIR, 'bin')
  const binary = join(binDir, HELPER_NAME)
  if (existsSync(binary)) return binary

  mkdirSync(binDir, { recursive: true })
  let result: ReturnType<typeof spawnSync>
  try {
    result = spawnSync('swiftc', [
      '-swift-version', '5', HELPER_SOURCE, '-o', binary,
      '-framework', 'CoreGraphics', '-framework', 'ApplicationServices',
    ], { encoding: 'utf8' })
  } catch (error) {
    throw new Error(`编译 macOS mouse helper 失败：${(error as Error).message}`)
  }
  if (result.error) throw new Error(`编译 macOS mouse helper 失败：${result.error.message}`)
  if (result.status !== 0) {
    const stderr = decode(result.stderr ?? '')
    throw new Error(`编译 macOS mouse helper 失败：${stderr || `exit ${result.status}`}`)
  }
  return binary
}

export interface RunningMouseCollector {
  readonly provider: 'macos-cgevent'
  readonly done: Promise<{ exitCode: number; stderr: string }>
  stop(): Promise<void>
}

/** 启动原生 helper，并把 stdout 中的 click event 转成 MouseClickEvent。 */
export function startMacMouseCollector(
  onClick: (event: MouseClickEvent) => void,
): RunningMouseCollector {
  const binary = ensureMacHelper()
  const child = spawn(binary, [], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderrText = ''
  let buf = ''

  const consume = (line: string) => {
    if (!line.trim()) return
    try {
      const value = JSON.parse(line) as { at?: unknown }
      if (typeof value.at === 'number' && Number.isFinite(value.at)) onClick({ at: value.at })
    } catch {
      // helper 输出异常时忽略该行，collector 继续工作
    }
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    buf += decode(chunk)
    let idx = buf.indexOf('\n')
    while (idx >= 0) {
      consume(buf.slice(0, idx))
      buf = buf.slice(idx + 1)
      idx = buf.indexOf('\n')
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => { stderrText += decode(chunk) })

  const done = new Promise<{ exitCode: number; stderr: string }>((resolve) => {
    let settled = false
    const finish = (exitCode: number, error = '') => {
      if (settled) return
      settled = true
      if (buf.trim()) consume(buf)
      resolve({ exitCode, stderr: stderrText || error })
    }
    child.once('error', (error) => finish(1, error.message))
    child.once('close', (code) => finish(code ?? 1))
  })

  return {
    provider: 'macos-cgevent',
    done,
    async stop() {
      if (child.exitCode === null) child.kill('SIGTERM')
      await done
    },
  }
}
