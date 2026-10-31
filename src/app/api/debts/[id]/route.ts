import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRecordMissing } from '@/lib/api-utils'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (typeof body?.person === 'string' && body.person.trim()) data.person = body.person.trim()
    if (body?.description !== undefined)
      data.description = body.description ? String(body.description).slice(0, 140) : null
    if (Number.isFinite(Number(body?.amount)) && Number(body.amount) > 0) data.amount = Number(body.amount)
    if (body?.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body?.kind === 'POR_PAGAR' || body?.kind === 'POR_COBRAR') data.kind = body.kind
    if (typeof body?.status === 'string' && ['PENDING', 'PARTIAL', 'SETTLED'].includes(body.status))
      data.status = body.status
    const debt = await db.debt.update({ where: { id }, data })
    return NextResponse.json(debt)
  } catch (e) {
    console.error('[debts PATCH]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await db.debt.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (isRecordMissing(e)) return NextResponse.json({ ok: true })
    console.error('[debts DELETE]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
