import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const ROOT = resolve(import.meta.dir, '..')
const PROTOTYPE = resolve(ROOT, 'prototypes/dusk-ledger')
async function generateFixture(day: string) {
  const p = Bun.spawn(['bun', 'run', 'scripts/make-prototype-fixture.ts', day], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  if (await p.exited !== 0) throw new Error(err.trim() || out.trim() || '生成 Dashboard 数据失败')
}
export async function startDashboard(day: string, port = 8912, openBrowser = true): Promise<void> {
  if (!existsSync(PROTOTYPE)) throw new Error(`找不到 Dashboard 原型目录：${PROTOTYPE}`)
  await generateFixture(day)
  const server = Bun.serve({ hostname: '127.0.0.1', port, async fetch(req) {
    const u = new URL(req.url); const pathname = u.pathname === '/' ? '/index.html' : u.pathname
    const file = Bun.file(resolve(PROTOTYPE, `.${pathname}`))
    return (await file.exists()) ? new Response(file) : new Response('Not Found', { status: 404 })
  }})
  const url = `http://${server.hostname}:${server.port}/`
  console.log(`Goule Dashboard 已启动：${url}`)
  console.log('按 Ctrl+C 停止服务。数据仅在本机处理，不上传云端。')
  if (openBrowser && process.platform === 'darwin') Bun.spawn(['open', url], { stdout: 'ignore', stderr: 'ignore' })
  else if (openBrowser && process.platform === 'linux') Bun.spawn(['xdg-open', url], { stdout: 'ignore', stderr: 'ignore' })
  await new Promise<void>(() => {})
}
