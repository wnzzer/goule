import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { generatePrototypeFixture } from './prototype/fixture'
import { loadMouseActivity } from './mouse/storage'
import { packagePath } from './runtime/paths'
import { GOULE_DIR } from './types/config'

const PROTOTYPE = packagePath('prototypes', 'dusk-ledger')
const DASHBOARD_DATA = resolve(GOULE_DIR, 'dashboard')
const ACTIVITY_PUSH_INTERVAL_MS = 1_000

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function validDayId(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(value))
}

function streamActivity(res: ServerResponse, dayId: string): void {
  res.writeHead(200, {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  let lastPayload = ''
  const push = () => {
    const payload = JSON.stringify(loadMouseActivity(dayId, false, null))
    if (payload === lastPayload) return
    lastPayload = payload
    res.write(`data: ${payload}\n\n`)
  }
  push()
  const timer = setInterval(push, ACTIVITY_PUSH_INTERVAL_MS)
  res.once('close', () => clearInterval(timer))
}

function staticFile(res: ServerResponse, pathname: string): void {
  let relative: string
  try { relative = decodeURIComponent(pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')) }
  catch { res.writeHead(400).end('Bad Request'); return }

  const root = relative === 'fixture.js' || relative.startsWith('exports/') ? DASHBOARD_DATA : PROTOTYPE
  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    if (!statSync(target).isFile()) throw new Error('not a file')
  } catch {
    res.writeHead(404).end('Not Found')
    return
  }
  res.writeHead(200, {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
  })
  createReadStream(target).pipe(res)
}

function openUrl(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null
  if (!command) return
  const child = spawn(command, [url], { detached: true, stdio: 'ignore' })
  child.unref()
}

export async function startDashboard(day: string, port = 8912, openBrowser = true): Promise<void> {
  if (!existsSync(PROTOTYPE)) throw new Error(`找不到 Dashboard 目录：${PROTOTYPE}`)
  await generatePrototypeFixture(day, resolve(DASHBOARD_DATA, 'fixture.js'))

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    if (url.pathname === '/api/activity' || url.pathname === '/api/activity/stream') {
      const dayId = url.searchParams.get('date')
      if (!validDayId(dayId)) { json(res, 400, { error: 'date 需为 YYYY-MM-DD' }); return }
      if (url.pathname.endsWith('/stream')) streamActivity(res, dayId)
      else json(res, 200, loadMouseActivity(dayId, false, null))
      return
    }
    staticFile(res, url.pathname)
  })

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolveListen())
  })
  const url = `http://127.0.0.1:${port}/index.html`
  console.log(`Goule Dashboard 已启动：${url}`)
  console.log('按 Ctrl+C 停止服务。数据仅在本机处理，不上传云端。')
  if (openBrowser) openUrl(url)
}
