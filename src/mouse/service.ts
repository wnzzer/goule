import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GOULE_DIR, resolveTz, type Config } from '../types/config'
import { logicalDay } from '../types/day'
import { DailyMouseAccumulator } from './aggregate'
import { startMacMouseCollector, type RunningMouseCollector } from './macos'
import { readMouseRecord, writeMouseRecordAsync } from './storage'

const PID_FILE = 'mouse-collector.pid'

function pidPath(root = GOULE_DIR): string {
  return join(root, 'activity', PID_FILE)
}

function readPid(root = GOULE_DIR): number | null {
  const path = pidPath(root)
  if (!existsSync(path)) return null
  try {
    const pid = Number(readFileSync(path, 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    // PID 文件可能在进程退出后残留并被系统复用；只停止明确属于 Goule
    // activity start 的进程，避免误杀其他用户进程。
    const result = Bun.spawnSync(['ps', '-p', String(pid), '-o', 'command='])
    const command = result.stdout ? new TextDecoder().decode(result.stdout) : ''
    return command.includes('activity start')
  } catch {
    return false
  }
}

function clearPid(root = GOULE_DIR): void {
  try { unlinkSync(pidPath(root)) } catch { /* 已清理或不存在 */ }
}

function writePid(root = GOULE_DIR): void {
  const dir = join(root, 'activity')
  mkdirSync(dir, { recursive: true })
  try { chmodSync(dir, 0o700) } catch { /* 权限由宿主文件系统决定 */ }
  writeFileSync(pidPath(root), `${process.pid}\n`, { mode: 0o600 })
}

function resolveProvider(cfg: Config): 'macos-cgevent' | 'linux-evdev' | 'activitywatch' | null {
  if (cfg.mouse.provider !== 'auto') return cfg.mouse.provider
  if (process.platform === 'darwin') return 'macos-cgevent'
  if (process.platform === 'linux') return 'linux-evdev'
  return null
}

export interface ActivityStatus {
  running: boolean
  pid: number | null
  provider: string | null
  dayId: string
  clicks: number
  coverage: string
}

export function activityStatus(cfg: Config): ActivityStatus {
  const tz = resolveTz(cfg.timezone)
  const dayId = logicalDay(Date.now(), cfg.dayCutoffHour, tz)
  const pid = readPid()
  const running = pid !== null && alive(pid)
  if (!running && pid !== null) clearPid()
  const record = readMouseRecord(dayId)
  return {
    running,
    pid: running ? pid : null,
    provider: record?.provider ?? resolveProvider(cfg),
    dayId,
    clicks: record?.clicks ?? 0,
    coverage: record?.coverage ?? 'unavailable',
  }
}

export function stopActivity(): void {
  const pid = readPid()
  if (pid === null || !alive(pid)) {
    if (pid !== null) clearPid()
    console.log('鼠标采集器当前未运行。')
    return
  }
  process.kill(pid, 'SIGTERM')
  console.log(`已请求停止鼠标采集器（pid ${pid}）。`)
}

async function flush(accumulator: DailyMouseAccumulator, cfg: Config): Promise<void> {
  if (!cfg.mouse.persist) return
  for (const record of accumulator.recordsToWrite()) {
    await writeMouseRecordAsync(record)
  }
}

/**
 * 前台运行 collector。用户可在另一个终端执行 `goule activity stop`，
 * 或直接 Ctrl-C；退出前会把聚合数据原子写入 ~/.goule/activity/。
 */
export async function startActivity(cfg: Config): Promise<void> {
  const provider = resolveProvider(cfg)
  if (provider !== 'macos-cgevent') {
    throw new Error(
      provider === null
        ? '当前平台没有可用的鼠标 collector（目前先支持 macOS）'
        : `collector ${provider} 尚未实现；目前先支持 macos-cgevent`,
    )
  }

  const current = activityStatus(cfg)
  if (current.running) throw new Error(`鼠标采集器已在运行（pid ${current.pid}）`)

  const tz = resolveTz(cfg.timezone)
  const accumulator = new DailyMouseAccumulator(cfg.dayCutoffHour, tz, provider)
  const dayId = logicalDay(Date.now(), cfg.dayCutoffHour, tz)
  const previous = readMouseRecord(dayId)
  if (previous) accumulator.load(previous)

  writePid()
  let lastObserved = Date.now()
  let stopped = false
  let flushing: Promise<void> = Promise.resolve()
  const flushNow = () => {
    const now = Date.now()
    accumulator.addObserved(lastObserved, now)
    lastObserved = now
    flushing = flushing.then(() => flush(accumulator, cfg))
    return flushing
  }

  let collector: RunningMouseCollector
  try {
    collector = startMacMouseCollector((event) => accumulator.addClick(event))
  } catch (error) {
    clearPid()
    throw error
  }

  const timer = setInterval(() => { void flushNow() }, 30_000)
  let shuttingDown = false
  const shutdown = async (persist = true) => {
    if (shuttingDown) return
    shuttingDown = true
    clearInterval(timer)
    if (!stopped) {
      stopped = true
      await collector.stop()
    }
    if (persist) await flushNow()
    clearPid()
  }
  process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)) })
  process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)) })

  console.log(`鼠标采集器启动中（${provider}），按 Ctrl-C 停止。`)
  const result = await collector.done
  if (result.exitCode !== 0) {
    await shutdown(false)
    if (/Accessibility permission|CGEventTap/i.test(result.stderr)) {
      throw new Error('未获得 macOS 辅助功能权限，请在“系统设置 → 隐私与安全性 → 辅助功能”中允许当前终端或 Goule helper。')
    }
    throw new Error(result.stderr || `鼠标 collector 退出码 ${result.exitCode}`)
  }
  await shutdown()
}
