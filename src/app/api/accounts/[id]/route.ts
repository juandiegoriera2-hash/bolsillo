import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRecordMissing } from '@/lib/api-utils'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (['BANK', 'CASH', 'WALLET', 'CRYPTO'].includes(body?.type)) data.type = body.type
    if (typeof body?.color === 'string') data.color = body.color
    if (typeof body?.icon === 'string') data.icon = body.icon
    if (body?.initialBalance !== undefined && Number.isFinite(Number(body.initialBalance)))
      data.initialBalance = Number(body.initialBalance)
    const account = await db.account.update({ where: { id }, data })
    return NextResponse.json(account)
  } catch (e) {
    console.error('[accounts PATCH]', e)
    return NextResponse.json({ error: 'Error actualizando cuenta' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const count = await db.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }] } })
    if (count > 0) {
      return NextResponse.json(
        { error: `No puedes eliminar una cuenta con ${count} movimientos. Reasigna o bórralos primero.` },
        { status: 400 }
      )
    }
    await db.account.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (isRecordMissing(e)) return NextResponse.json({ ok: true })
    console.error('[accounts DELETE]', e)
    return NextResponse.json({ error: 'Error eliminando cuenta' }, { status: 500 })
  }
}
