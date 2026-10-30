// ─────────────────────────────────────────────────────────────────
// Bolsillo — Tipos y utilidades financieras compartidas
// ─────────────────────────────────────────────────────────────────

export type Currency = 'VES' | 'USD' | 'USDT' | 'EUR'
export type ValuationSource = 'BCV' | 'PARALELO' | 'USDT_P2P'
export type TxType = 'EXPENSE' | 'INCOME' | 'TRANSFER'
export type TxSource = 'MANUAL' | 'AI_CHAT' | 'VOICE' | 'OCR'
export type BudgetCycle = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM'
export type DebtKind = 'POR_PAGAR' | 'POR_COBRAR'

export const CURRENCIES: Currency[] = ['VES', 'USD', 'USDT', 'EUR']

export const CURRENCY_META: Record<
  Currency,
  { label: string; short: string; color: string }
> = {
  VES: { label: 'Bolívares', short: 'Bs', color: '#f5b544' },
  USD: { label: 'Dólares', short: '$', color: '#38e07f' },
  USDT: { label: 'USDT', short: '₮', color: '#2dd4bf' },
  EUR: { label: 'Euros', short: '€', color: '#c084fc' },
}

export const SOURCE_META: Record<ValuationSource, { label: string; color: string }> = {
  BCV: { label: 'BCV Oficial', color: '#f5b544' },
  PARALELO: { label: 'Paralelo', color: '#38e07f' },
  USDT_P2P: { label: 'USDT P2P', color: '#2dd4bf' },
}

/** Snapshot de tasas del día ( Bs por divisa ) */
export type RateSnapshot = {
  bcv: number | null
  paralelo: number | null
  usdt: number | null
  eurBcv: number | null
  eurParalelo: number | null
  eurUsd: number
  dateKeys: { bcv: string | null; paralelo: string | null; usdt: string | null }
  updatedAt: { bcv: string | null; paralelo: string | null; usdt: string | null }
}

export const CARACAS_TZ = 'America/Caracas'

/** yyyy-MM-dd en horario de Venezuela (UTC-4, sin DST — cálculo manual determinista) */
export function caracasDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10)
}

/** Fecha local Caracas a partir de un dateKey (mediodía, seguro para TZ) */
export function dateKeyToDate(key: string): Date {
  return new Date(`${key}T12:00:00`)
}

/** Bs por USD según la fuente elegida */
export function vesRate(rates: RateSnapshot, source: ValuationSource = 'PARALELO'): number {
  const v = source === 'BCV' ? rates.bcv : source === 'USDT_P2P' ? rates.usdt : rates.paralelo
  return v ?? rates.paralelo ?? rates.bcv ?? rates.usdt ?? 1
}

/** Convierte cualquier monto a USD usando el snapshot de tasas */
export function toUsd(
  amount: number,
  currency: Currency,
  rates: RateSnapshot,
  source: ValuationSource = 'PARALELO'
): number {
  if (currency === 'USD' || currency === 'USDT') return amount
  if (currency === 'EUR') return amount * (rates.eurUsd || 1.16)
  return amount / vesRate(rates, source)
}

/** Conversión entre monedas soportadas (pivote USD) */
export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  rates: RateSnapshot,
  source: ValuationSource = 'PARALELO'
): number {
  if (from === to) return amount
  const usd = toUsd(amount, from, rates, source)
  if (to === 'USD' || to === 'USDT') return usd
  if (to === 'EUR') return usd / (rates.eurUsd || 1.16)
  return usd * vesRate(rates, source)
}

const nf2 = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const nf0 = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 })

/** Formato completo: "Bs 1.234,56" · "$890,50" · "€1.200" · "₮450" */
export function formatMoney(amount: number, currency: Currency, decimals = true): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  const num = (decimals ? nf2 : nf0).format(abs)
  switch (currency) {
    case 'VES':
      return `${sign}Bs ${num}`
    case 'USD':
      return `${sign}$${num}`
    case 'EUR':
      return `${sign}€${num}`
    case 'USDT':
      return `${sign}₮${num}`
  }
}

/** Formato compacto para espacios reducidos: "45,3k" */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')}M`
  if (abs >= 10_000) return `${sign}${(abs / 1000).toFixed(0)}k`
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1).replace('.', ',')}k`
  return `${sign}${nf0.format(abs)}`
}

/** "Bs 993,12" para tasas */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `Bs ${nf2.format(rate)}`
}

// ── Ciclos de presupuesto ────────────────────────────────────────

/** Devuelve {start, end, label} del ciclo actual del presupuesto */
export function budgetCycleWindow(
  budget: { cycle: string; startDate: Date | string; customDays?: number | null },
  now: Date = new Date()
): { start: Date; end: Date; label: string } {
  const start = new Date(budget.startDate)
  if (budget.cycle === 'WEEKLY') {
    const s = new Date(now)
    const day = (s.getDay() + 6) % 7 // lunes = 0
    s.setDate(s.getDate() - day)
    s.setHours(0, 0, 0, 0)
    const e = new Date(s)
    e.setDate(e.getDate() + 7)
    return { start: s, end: e, label: 'semana actual' }
  }
  if (budget.cycle === 'MONTHLY') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start: s, end: e, label: 'mes actual' }
  }
  const days = budget.cycle === 'BIWEEKLY' ? 15 : Math.max(1, budget.customDays ?? 30)
  const ms = days * 86400000
  const elapsed = Math.max(0, now.getTime() - start.getTime())
  const n = Math.floor(elapsed / ms)
  const s = new Date(start.getTime() + n * ms)
  const e = new Date(s.getTime() + ms)
  const label =
    budget.cycle === 'BIWEEKLY' ? 'ciclo quincenal' : `ciclo de ${days} días`
  return { start: s, end: e, label }
}

export function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
