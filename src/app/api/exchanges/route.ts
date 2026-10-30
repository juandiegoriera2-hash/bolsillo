import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { txToUsd } from '@/lib/queries'
import type { RateSnapshot } from '@/lib/finance'

/** Tasa de mercado (Bs por divisa) según fuente */
function marketRateFor(currency: string, rates: RateSnapshot, source: string): number {
  const usd = source === 'BCV' ? rates.bcv : source === 'USDT_P2P' ? rates.usdt : rates.paralelo
  if (currency === 'USD') return usd ?? rates.paralelo ?? 1
  if (currency === 'USDT') return rates.usdt ?? usd ?? 1
  if (currency === 'EUR') {
    if (source === 'BCV' && rates.eurBcv) return rates.eurBcv
    if (rates.eurParalelo) return rates.eurParalelo
    return (usd ?? 1) * rates.eurUsd
  }
  return 1
}

/** Cruz divisa→divisa (unidades de `to` por unidad de `from`) */
function crossRate(from: string, to: string, rates: RateSnapshot, source: string): number {
  if ((from === 'USD' || from === 'USDT') && (to === 'USDT' || to === 'USD')) return 1
  if (from === 'EUR' && (to === 'USD' || to === 'USDT')) return rates.eurUsd
  if ((from === 'USD' || from === 'USDT') && to === 'EUR') return 1 / (rates.eurUsd || 1.16)
  return marketRateFor(from, rates, source) / marketRateFor(to, rates, source)
}

export async function GET() {
  try {
    await ensureSeed()
    const rates = await getRateSnapshot()
    const rows = await db.currencyExchange.findMany({
      include: { fromAccount: true, toAccount: true },
      orderBy: { date: 'desc' },
    })
    let gainedUsd = 0
    let lostUsd = 0
    const items = rows.map((r) => {
      const diffUsd =
        r.fromCurrency === 'VES' || r.toCurrency === 'VES'
          ? txToUsd(r.differential, 'VES', rates.paralelo, rates)
          : r.differential / (rates.eurUsd || 1.16)
      if (r.differential >= 0) gainedUsd += diffUsd
      else lostUsd += Math.abs(diffUsd)
      return {
        id: r.id,
        fromAccountId: r.fromAccountId,
        fromAccountName: r.fromAccount?.name ?? '',
        fromCurrency: r.fromCurrency,
        toAccountId: r.toAccountId,
        toAccountName: r.toAccount?.name ?? '',
        toCurrency: r.toCurrency,
        fromAmount: r.fromAmount,
        toAmount: r.toAmount,
        direction: r.direction,
        impliedRate: r.impliedRate,
        marketRate: r.marketRate,
        marketSource: r.marketSource,
        differential: r.differential,
        differentialUsd: diffUsd,
        date: r.date.toISOString(),
        note: r.note,
      }
    })
    return NextResponse.json({ items, gainedUsd, lostUsd, netUsd: gainedUsd - lostUsd })
  } catch (e) {
    console.error('[exchanges GET]', e)
    return NextResponse.json({ error: 'Error cargando cambios' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const fromAccountId = String(body?.fromAccountId ?? '')
    const toAccountId = String(body?.toAccountId ?? '')
    const fromAmount = Number(body?.fromAmount)
    const toAmount = Number(body?.toAmount)
    if (!Number.isFinite(fromAmount) || fromAmount <= 0 || !Number.isFinite(toAmount) || toAmount <= 0)
      return NextResponse.json({ error: 'Montos inválidos' }, { status: 400 })
    if (fromAccountId === toAccountId)
      return NextResponse.json({ error: 'Selecciona cuentas distintas' }, { status: 400 })

    const [fromAcc, toAcc] = await Promise.all([
      db.account.findUnique({ where: { id: fromAccountId } }),
      db.account.findUnique({ where: { id: toAccountId } }),
    ])
    if (!fromAcc || !toAcc) return NextResponse.json({ error: 'Cuentas no encontradas' }, { status: 400 })
    if (fromAcc.currency === toAcc.currency)
      return NextResponse.json(
        { error: 'Entre cuentas de la misma moneda usa una Transferencia' },
        { status: 400 }
      )

    const rates = await getRateSnapshot()
    const marketSource = ['BCV', 'PARALELO', 'USDT_P2P', 'MANUAL'].includes(body?.marketSource)
      ? body.marketSource
      : 'PARALELO'

    const from = fromAcc.currency
    const to = toAcc.currency
    let direction: string
    let impliedRate: number
    let marketRate: number
    let differential: number

    if (from === 'VES' && to !== 'VES') {
      // comprando divisa con Bs
      direction = 'BUY_FOREIGN'
      impliedRate = fromAmount / toAmount // Bs por divisa
      marketRate = marketRateFor(to, rates, marketSource)
      differential = (marketRate - impliedRate) * toAmount // + = compraste más barato que el mercado
    } else if (from !== 'VES' && to === 'VES') {
      // vendiendo divisa por Bs
      direction = 'SELL_FOREIGN'
      impliedRate = toAmount / fromAmount
      marketRate = marketRateFor(from, rates, marketSource)
      differential = (impliedRate - marketRate) * fromAmount // + = vendiste por encima del mercado
    } else {
      // divisa → divisa
      direction = 'FOREIGN_TO_FOREIGN'
      impliedRate = toAmount / fromAmount
      marketRate = crossRate(from, to, rates, marketSource)
      differential = (impliedRate - marketRate) * fromAmount // en moneda `to`
    }

    const created = await db.currencyExchange.create({
      data: {
        fromAccountId,
        toAccountId,
        fromCurrency: from,
        toCurrency: to,
        fromAmount,
        toAmount,
        direction,
        impliedRate,
        marketRate,
        marketSource,
        differential,
        date: body?.date ? new Date(body.date) : new Date(),
        note: body?.note ? String(body.note).slice(0, 140) : null,
      },
    })
    return NextResponse.json({ ...created, differentialUsd: txToUsd(differential, from === 'VES' || to === 'VES' ? 'VES' : to, rates.paralelo, rates) })
  } catch (e) {
    console.error('[exchanges POST]', e)
    return NextResponse.json({ error: 'Error registrando cambio' }, { status: 500 })
  }
}
