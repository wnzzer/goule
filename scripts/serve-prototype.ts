#!/usr/bin/env bun

import { resolve, sep } from 'node:path'
import { loadMouseActivity } from '../src/mouse/storage'

const root = resolve('prototypes/dusk-ledger')
const port = Number(Bun.argv[2] ?? 8912)
const activityPushIntervalMs = 1_000
const encoder = new TextEncoder()

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`端口需为 1–65535 的整数，收到：${Bun.argv[2] ?? ''}`)
}

function noStore(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers)
  result.set('Cache-Control', 'no-store, max-age=0')
  return result
}

function validDayId(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

async function staticResponse(pathname: string): Promise<Response> {
  let relative: string
  try {
    relative = decodeURIComponent(pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''))
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    return new Response('Forbidden', { status: 403 })
  }

  const file = Bun.file(target)
  if (!await file.exists()) return new Response('Not Found', { status: 404 })
  return new Response(file, { headers: noStore() })
}

function liveActivityResponse(dayId: string, signal: AbortSignal): Response {
  let stop = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let lastPayload = ''
      let timer: ReturnType<typeof setInterval> | null = null

      stop = () => {
        if (closed) return
        closed = true
        if (timer !== null) clearInterval(timer)
      }

      const push = () => {
        if (closed) return
        try {
          const payload = JSON.stringify(loadMouseActivity(dayId, false, null))
          if (payload === lastPayload) return
          lastPayload = payload
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        } catch {
          stop()
        }
      }

      push()
      timer = setInterval(push, activityPushIntervalMs)
      signal.addEventListener('abort', stop, { once: true })
    },
    cancel() {
      stop()
    },
  })

  return new Response(stream, {
    headers: noStore({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }),
  })
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/activity' || url.pathname === '/api/activity/stream') {
      const dayId = url.searchParams.get('date')
      if (!validDayId(dayId)) {
        return Response.json({ error: 'date 需为 YYYY-MM-DD' }, { status: 400, headers: noStore() })
      }
      if (url.pathname.endsWith('/stream')) return liveActivityResponse(dayId, request.signal)
      return Response.json(loadMouseActivity(dayId, false, null), { headers: noStore() })
    }
    return staticResponse(url.pathname)
  },
})

console.log(`Goule 原型已启动：http://${server.hostname}:${server.port}/index.html`)
console.log('鼠标点击数据已接入实时事件流，变化会在约 1 秒内更新。按 Ctrl-C 停止。')
