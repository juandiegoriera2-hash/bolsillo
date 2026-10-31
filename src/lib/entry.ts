// ─────────────────────────────────────────────────────────────────
// Bolsillo — Entrada mixta de moneda (server)
// El usuario puede registrar en Bs o divisas desde cualquier cuenta;
// el monto se convierte automáticamente a la moneda del saldo con la
// tasa elegida (BCV / Paralelo / USDT / personalizada).
// ─────────────────────────────────────────────────────────────────
import {
  convertEntry,
  entryRate,
  pairRateToUsd,
  type Currency,
  type RateChoice,
  type RateSnapshot,
} from '@/lib/finance'

export type EntryConversion = {
  amount: number // monto final en la moneda de la cuenta
  originalAmount: number | null // monto tal como lo escribió el usuario
  originalCurrency: string | null
  rateSource: string | null
  rateVesUsd: number // Bs/USD equivalente (valuación histórica)
}

const CURRENCY_LIST = ['VES', 'USD', 'USDT', 'EUR']
const CHOICE_LIST: RateChoice[] = ['BCV', 'PARALELO', 'USDT_P2P', 'MANUAL']

/**
 * Normaliza el payload del cliente: `amount` + `currency` (moneda en la que
 * se ingresó) → monto convertido a la moneda de la cuenta con la tasa
 * elegida. Si `entryCurrency` es igual a la de la cuenta (o no viene),
 * no hay conversión.
 */
export function resolveEntry(opts: {
  amount: number
  entryCurrency?: unknown
  accountCurrency: string
  rateSource?: unknown
  customRate?: unknown
  rates: RateSnapshot
}): EntryConversion | { error: string } {
  const { amount, accountCurrency, rates } = opts
  const acc = accountCurrency as Currency
  const entry: Currency =
    typeof opts.entryCurrency === 'string' && CURRENCY_LIST.includes(opts.entryCurrency)
      ? (opts.entryCurrency as Currency)
      : acc
  const choice: RateChoice =
    typeof opts.rateSource === 'string' && CHOICE_LIST.includes(opts.rateSource as RateChoice)
      ? (opts.rateSource as RateChoice)
      : 'BCV'
  const customNum = Number(opts.customRate)
  const customRate = Number.isFinite(customNum) && customNum > 0 ? customNum : null
  const eurUsd = rates.eurUsd || 1.16

  const rate = entryRate(rates, choice, entry, acc, customRate)
  if (!Number.isFinite(rate) || rate <= 0) return { error: 'Tasa de cambio no disponible' }

  let finalAmount = amount
  let originalAmount: number | null = null
  let originalCurrency: string | null = null
  if (entry !== acc) {
    finalAmount = Math.round(convertEntry(amount, entry, acc, rate, eurUsd) * 100) / 100
    if (!Number.isFinite(finalAmount) || finalAmount <= 0)
      return { error: 'Monto o tasa inválida para la conversión' }
    originalAmount = amount
    originalCurrency = entry
  }

  const pairCurrency: Currency = entry === 'VES' ? acc : entry
  return {
    amount: finalAmount,
    originalAmount,
    originalCurrency,
    rateSource: choice,
    rateVesUsd: pairRateToUsd(rate, pairCurrency, eurUsd),
  }
}
