import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { getAccountsWithBalances } from '@/lib/queries'

const CURRENCIES = ['VES', 'USD', 'USDT', 'EUR']
const TYPES = ['BANK', 'CASH', 'WALLET', 'CRYPTO']

export async function GET() {
  try {
    await ensureSeed()
    const rates = await getRateSnapshot()
    const accounts = await getAccountsWithBalances(rates)
    return NextResponse.json(accounts)
  } catch (e) {
    console.error('[accounts GET]', e)
    return NextResponse.json({ error: 'Error cargando cuentas' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = String(body?.name ?? '').trim()
    const currency = CURRENCIES.includes(body?.currency) ? body.currency : 'VES'
    const type = TYPES.includes(body?.type) ? body.type : 'BANK'
    const initialBalance = Number(body?.initialBalance ?? 0)
    if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    if (!Number.isFinite(initialBalance))
      return NextResponse.json({ error: 'Saldo inicial inválido' }, { status: 400 })
    const account = await db.account.create({
      data: {
        name,
        currency,
        type,
        initialBalance,
        color: typeof body?.color === 'string' ? body.color : '#38e07f',
        icon: typeof body?.icon === 'string' ? body.icon : 'wallet',
      },
    })
    return NextResponse.json(account)
  } catch (e) {
    console.error('[accounts POST]', e)
    return NextResponse.json({ error: 'Error creando cuenta' }, { status: 500 })
  }
}
