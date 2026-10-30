import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (Number.isFinite(Number(body?.limitAmount)) && Number(body.limitAmount) > 0)
      data.limitAmount = Number(body.limitAmount)
    if (body?.categoryId !== undefined) data.categoryId = body.categoryId || null
    if (body?.tagId !== undefined) data.tagId = body.tagId || null
    if (['USD', 'VES'].includes(body?.currency)) data.currency = body.currency
    if (['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'].includes(body?.cycle)) data.cycle = body.cycle
    if (body?.customDays !== undefined)
      data.customDays = body.customDays ? Math.min(365, Math.max(1, Number(body.customDays))) : null
    if (typeof body?.active === 'boolean') data.active = body.active
    if (body?.startDate) data.startDate = new Date(body.startDate)
    const budget = await db.budget.update({ where: { id }, data })
    return NextResponse.json(budget)
  } catch (e) {
    console.error('[budgets PATCH]', e)
    return NextResponse.json({ error: 'Error actualizando presupuesto' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await db.budget.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[budgets DELETE]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
