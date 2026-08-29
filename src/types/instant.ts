/** UTC 瞬时，epoch 毫秒。内部一律用它；禁止在本模块之外做本地时间换算。 */
export type Instant = number

/** IANA 时区名，如 'Asia/Shanghai' */
export type Tz = string

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000

/**
 * 严格 ISO-8601 带偏移。必须严格：`Date.parse` 会退回 V8 的宽松解析器，
 * 那里一个多余空格就会把 UTC 解释成本机时区（Asia/Shanghai 下即 8 小时误差）。
 * 输入来自我们不控制、且格式可能变化的外部 session 文件，宁可丢弃也不能误解。
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function parseInstant(iso: string): Instant | null {
  if (!ISO_INSTANT_RE.test(iso)) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

const fmtCache = new Map<Tz, Intl.DateTimeFormat>()

function formatter(tz: Tz): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
    fmtCache.set(tz, f)
  }
  return f
}

export interface LocalParts {
  year: number; month: number; day: number
  hour: number; minute: number; second: number
}

export function localParts(at: Instant, tz: Tz): LocalParts {
  const parts = formatter(tz).formatToParts(at)
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type)
    if (!p) throw new Error(`时区格式化缺少字段: ${type}`)
    return Number(p.value)
  }
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  }
}

export const pad = (n: number): string => String(n).padStart(2, '0')

export function localDate(at: Instant, tz: Tz): string {
  const p = localParts(at, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function localHour(at: Instant, tz: Tz): number {
  return localParts(at, tz).hour
}

/**
 * 本地墙钟时间 → Instant。
 * 先按 UTC 猜，再用该时刻的实际偏移修正；两次迭代足以收敛（含 DST 切换）。
 */
export function localToInstant(
  year: number, month: number, day: number, hour: number, tz: Tz,
): Instant {
  const target = Date.UTC(year, month - 1, day, hour, 0, 0)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, tz)
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    guess += target - asIfUtc
  }
  return guess
}
