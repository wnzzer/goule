import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { GOULE_DIR } from '../types/config'
import type { MouseClickEvent } from './types'

const HELPER_NAME = 'goule-mouse-helper'
const HELPER_SOURCE = join(import.meta.dir, '../../native/macos/goule-mouse-helper.swift')

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
  let result: ReturnType<typeof Bun.spawnSync>
  try {
    result = Bun.spawnSync([
      'swiftc', '-swift-version', '5', HELPER_SOURCE, '-o', binary,
      '-framework', 'CoreGraphics', '-framework', 'ApplicationServices',
    ])
  } catch (error) {
    throw new Error(`编译 macOS mouse helper 失败：${(error as Error).message}`)
  }
  if (result.exitCode !== 0) {
    const stderr = decode(result.stderr ?? new Uint8Array())
    throw new Error(`编译 macOS mouse helper 失败：${stderr || `exit ${result.exitCode}`}`)
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
  const child = Bun.spawn([binary], { stdout: 'pipe', stderr: 'pipe' })
  const stdout = child.stdout
  const stderr = child.stderr
  let stderrText = ''

  const stderrDone = (async () => {
    if (!stderr) return
    for await (const chunk of stderr) stderrText += decode(chunk as Uint8Array | string)
  })()

  const done = (async () => {
    let buf = ''
    if (stdout) {
      for await (const chunk of stdout) {
        buf += decode(chunk as Uint8Array | string)
        let idx = buf.indexOf('\n')
        while (idx >= 0) {
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 1)
          if (line.trim()) {
            try {
              const value = JSON.parse(line) as { at?: unknown }
              if (typeof value.at === 'number' && Number.isFinite(value.at)) onClick({ at: value.at })
            } catch {
              // helper 输出异常时忽略该行，collector 继续工作
            }
          }
          idx = buf.indexOf('\n')
        }
      }
    }
    if (buf.trim()) {
      try {
        const value = JSON.parse(buf) as { at?: unknown }
        if (typeof value.at === 'number' && Number.isFinite(value.at)) onClick({ at: value.at })
      } catch {
        // 丢弃不完整尾行
      }
    }
    const exitCode = await child.exited
    await stderrDone
    return { exitCode, stderr: stderrText }
  })()

  return {
    provider: 'macos-cgevent',
    done,
    async stop() {
      child.kill('SIGTERM')
      await done
    },
  }
}
