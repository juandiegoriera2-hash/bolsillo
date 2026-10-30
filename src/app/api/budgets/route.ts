import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { getBudgetStatuses } from '@/lib/queries'

export async function GET() {
  try {
    await ensureSeed()
    const rates = await getRateSnapshot()
    const budgets = await getBudgetStatuses(rates)
    return NextResponse.json(budgets)
  } catch (e) {
    console.error('[budgets GET]', e)
    return NextResponse.json({ error: 'Error cargando presupuestos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = String(body?.name ?? '').trim()
    const limitAmount = Number(body?.limitAmount)
    if (!name || !Number.isFinite(limitAmount) || limitAmount <= 0)
      return NextResponse.json({ error: 'Nombre y límite son obligatorios' }, { status: 400 })
    const budget = await db.budget.create({
      data: {
        name,
        categoryId: body?.categoryId || null,
        tagId: body?.tagId || null,
        limitAmount,
        currency: body?.currency === 'VES' ? 'VES' : 'USD',
        cycle: ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'].includes(body?.cycle) ? body.cycle : 'MONTHLY',
        customDays: body?.customDays ? Math.min(365, Math.max(1, Number(body.customDays))) : null,
        startDate: body?.startDate ? new Date(body.startDate) : new Date(),
      },
    })
    return NextResponse.json(budget)
  } catch (e) {
    console.error('[budgets POST]', e)
    return NextResponse.json({ error: 'Error creando presupuesto' }, { status: 500 })
  }
}
