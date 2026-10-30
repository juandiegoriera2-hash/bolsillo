import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { getDebtsWithPayments } from '@/lib/queries'

export async function GET() {
  try {
    await ensureSeed()
    const rates = await getRateSnapshot()
    const debts = await getDebtsWithPayments(rates)
    return NextResponse.json(debts)
  } catch (e) {
    console.error('[debts GET]', e)
    return NextResponse.json({ error: 'Error cargando deudas' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const person = String(body?.person ?? '').trim()
    const amount = Number(body?.amount)
    if (!person || !Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'Persona y monto son obligatorios' }, { status: 400 })
    const rates = await getRateSnapshot()
    const debt = await db.debt.create({
      data: {
        kind: body?.kind === 'POR_COBRAR' ? 'POR_COBRAR' : 'POR_PAGAR',
        person,
        description: body?.description ? String(body.description).slice(0, 140) : null,
        amount,
        currency: ['VES', 'USD', 'USDT', 'EUR'].includes(body?.currency) ? body.currency : 'USD',
        dueDate: body?.dueDate ? new Date(body.dueDate) : null,
        status: 'PENDING',
        rateVesUsd: rates.paralelo,
      },
    })
    return NextResponse.json(debt)
  } catch (e) {
    console.error('[debts POST]', e)
    return NextResponse.json({ error: 'Error creando deuda' }, { status: 500 })
  }
}
