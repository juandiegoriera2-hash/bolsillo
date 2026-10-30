// ─────────────────────────────────────────────────────────────────
// Bolsillo — Motor multimoneda: tasas BCV / Paralelo / USDT P2P
// Fuentes: ve.dolarapi.com (BCV + paralelo) · Binance P2P (USDT)
// ─────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { caracasDateKey, type RateSnapshot } from '@/lib/finance'

const STALE_HOURS = 3
let lastRefreshAttempt = 0

async function timeoutFetch(url: string, ms = 7000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(t)
  }
}

/** BCV oficial y paralelo desde dolarapi */
async function fetchDolarApi(kind: 'oficial' | 'paralelo'): Promise<number | null> {
  try {
    const res = await timeoutFetch(`https://ve.dolarapi.com/v1/dolares/${kind}`)
    if (!res.ok) return null
    const json = (await res.json()) as { promedio?: number | null }
    const v = json.promedio
    return typeof v === 'number' && v > 0 ? v : null
  } catch {
    return null
  }
}

/** Mediana de los mejores anuncios P2P de Binance (VES) */
async function fetchBinanceP2P(tradeType: 'BUY' | 'SELL'): Promise<number | null> {
  try {
    const res = await timeoutFetch(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      8000,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: 'USDT',
          fiat: 'VES',
          tradeType,
          page: 1,
          rows: 8,
          payTypes: [],
          publisherType: null,
        }),
      }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { data?: Array<{ adv?: { price?: string } }> }
    const prices = (json.data ?? [])
      .map((d) => parseFloat(d.adv?.price ?? ''))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b)
    if (prices.length === 0) return null
    return prices[Math.floor(prices.length / 2)]
  } catch {
    return null
  }
}

/** EUR/USD cruz (BCE) con fallback fijo */
async function fetchEurUsd(): Promise<number> {
  try {
    const res = await timeoutFetch('https://api.frankfurter.app/latest?from=EUR&to=USD', 6000)
    if (!res.ok) return 1.16
    const json = (await res.json()) as { rates?: { USD?: number } }
    const v = json.rates?.USD
    return typeof v === 'number' && v > 0.5 && v < 2 ? v : 1.16
  } catch {
    return 1.16
  }
}

/** Busca tasas frescas en las fuentes externas y las persiste */
export async function refreshRates(): Promise<{ updated: string[] }> {
  const [bcv, paralelo, p2pSell, p2pBuy, eurUsd] = await Promise.all([
    fetchDolarApi('oficial'),
    fetchDolarApi('paralelo'),
    fetchBinanceP2P('SELL'),
    fetchBinanceP2P('BUY'),
    fetchEurUsd(),
  ])

  const usdt = [p2pSell, p2pBuy].filter((v): v is number => v != null).length
    ? [p2pSell, p2pBuy].filter((v): v is number => v != null).reduce((a, b) => a + b, 0) /
      [p2pSell, p2pBuy].filter((v): v is number => v != null).length
    : null

  const dateKey = caracasDateKey()
  const updated: string[] = []

  if (bcv) {
    await db.exchangeRate.upsert({
      where: { dateKey_source: { dateKey, source: 'BCV' } },
      update: { usd: bcv, eur: bcv * eurUsd, fetchedAt: new Date(), manual: false },
      create: { dateKey, source: 'BCV', usd: bcv, eur: bcv * eurUsd },
    })
    updated.push('BCV')
  }
  if (paralelo) {
    await db.exchangeRate.upsert({
      where: { dateKey_source: { dateKey, source: 'PARALELO' } },
      update: { usd: paralelo, eur: paralelo * eurUsd, fetchedAt: new Date(), manual: false },
      create: { dateKey, source: 'PARALELO', usd: paralelo, eur: paralelo * eurUsd },
    })
    updated.push('PARALELO')
  }
  if (usdt) {
    await db.exchangeRate.upsert({
      where: { dateKey_source: { dateKey, source: 'USDT_P2P' } },
      update: { usd: usdt, eur: usdt * eurUsd, fetchedAt: new Date(), manual: false },
      create: { dateKey, source: 'USDT_P2P', usd: usdt, eur: usdt * eurUsd },
    })
    updated.push('USDT_P2P')
  }
  lastRefreshAttempt = Date.now()
  return { updated }
}

async function readSnapshot(): Promise<RateSnapshot> {
  const rows = await db.exchangeRate.findMany({
    orderBy: [{ dateKey: 'desc' }, { fetchedAt: 'desc' }],
    take: 30,
  })
  const latest = (source: string) => rows.find((r) => r.source === source)
  const bcv = latest('BCV')
  const paralelo = latest('PARALELO')
  const usdt = latest('USDT_P2P')
  const eurUsd =
    bcv?.usd && bcv.eur ? bcv.eur / bcv.usd : paralelo?.usd && paralelo.eur ? paralelo.eur / paralelo.usd : 1.16
  return {
    bcv: bcv?.usd ?? null,
    paralelo: paralelo?.usd ?? null,
    usdt: usdt?.usd ?? null,
    eurBcv: bcv?.eur ?? null,
    eurParalelo: paralelo?.eur ?? null,
    eurUsd: eurUsd || 1.16,
    dateKeys: {
      bcv: bcv?.dateKey ?? null,
      paralelo: paralelo?.dateKey ?? null,
      usdt: usdt?.dateKey ?? null,
    },
    updatedAt: {
      bcv: bcv?.fetchedAt?.toISOString() ?? null,
      paralelo: paralelo?.fetchedAt?.toISOString() ?? null,
      usdt: usdt?.fetchedAt?.toISOString() ?? null,
    },
  }
}

/** Snapshot vigente. Refresca automáticamente si está vencido (best-effort). */
export async function getRateSnapshot(opts?: { force?: boolean }): Promise<RateSnapshot> {
  const current = await readSnapshot()
  const stale =
    !current.paralelo ||
    !current.bcv ||
    Object.values(current.updatedAt).every((t) => {
      if (!t) return true
      return Date.now() - new Date(t).getTime() > STALE_HOURS * 3600_000
    })
  const throttled = Date.now() - lastRefreshAttempt < 60_000
  if ((opts?.force || stale) && !throttled) {
    try {
      await refreshRates()
    } catch {
      /* sin internet: seguimos con lo último conocido */
    }
  }
  return readSnapshot()
}

export type RateHistoryPoint = { dateKey: string; bcv: number | null; paralelo: number | null; usdt: number | null }

/** Historial de los últimos N días (con relleno de huecos hacia adelante) */
export async function getRatesHistory(days = 30): Promise<RateHistoryPoint[]> {
  const rows = await db.exchangeRate.findMany({ orderBy: { dateKey: 'asc' } })
  const map = new Map<string, RateHistoryPoint>()
  for (const r of rows) {
    const p =
      map.get(r.dateKey) ?? { dateKey: r.dateKey, bcv: null, paralelo: null, usdt: null }
    if (r.source === 'BCV') p.bcv = r.usd
    if (r.source === 'PARALELO') p.paralelo = r.usd
    if (r.source === 'USDT_P2P') p.usdt = r.usd
    map.set(r.dateKey, p)
  }
  const all = [...map.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  // forward-fill de huecos
  let last: RateHistoryPoint | null = null
  for (const p of all) {
    if (last) {
      if (p.bcv == null) p.bcv = last.bcv
      if (p.paralelo == null) p.paralelo = last.paralelo
      if (p.usdt == null) p.usdt = last.usdt
    }
    last = p
  }
  return all.slice(-days)
}

/** Tasa manual (el usuario puede fijar cualquier fuente) */
export async function setManualRate(source: 'BCV' | 'PARALELO' | 'USDT_P2P', usd: number, eur?: number): Promise<void> {
  const dateKey = caracasDateKey()
  await db.exchangeRate.upsert({
    where: { dateKey_source: { dateKey, source } },
    update: { usd, eur: eur ?? null, manual: true, fetchedAt: new Date() },
    create: { dateKey, source, usd, eur: eur ?? null, manual: true },
  })
}
