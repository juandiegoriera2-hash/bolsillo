import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRecordMissing } from '@/lib/api-utils'
import { serializeTx, TX_INCLUDE } from '@/lib/dto'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await db.transaction.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (Number.isFinite(Number(body?.amount)) && Number(body.amount) > 0) data.amount = Number(body.amount)
    if (body?.description !== undefined)
      data.description = body.description ? String(body.description).slice(0, 140) : null
    if (body?.reference !== undefined) data.reference = body.reference ? String(body.reference).slice(0, 60) : null
    if (body?.categoryId !== undefined) data.categoryId = body.categoryId || null
    if (body?.accountId) {
      const acc = await db.account.findUnique({ where: { id: String(body.accountId) } })
      if (acc) {
        data.accountId = acc.id
        data.currency = acc.currency
      }
    }
    if (body?.toAccountId !== undefined) {
      if (body.toAccountId) {
        const acc = await db.account.findUnique({ where: { id: String(body.toAccountId) } })
        if (acc) data.toAccountId = acc.id
      } else {
        data.toAccountId = null
      }
    }
    if (body?.date) data.date = new Date(body.date)

    await db.transaction.update({ where: { id }, data })
    if (Array.isArray(body?.tagIds)) {
      await db.transactionTag.deleteMany({ where: { transactionId: id } })
      if (body.tagIds.length > 0) {
        await db.transactionTag.createMany({
          data: body.tagIds.slice(0, 10).map((tagId: string) => ({ transactionId: id, tagId })),
          skipDuplicates: true,
        })
      }
    }
    const full = await db.transaction.findUnique({ where: { id }, include: TX_INCLUDE })
    return NextResponse.json(serializeTx(full!))
  } catch (e) {
    console.error('[transactions PATCH]', e)
    return NextResponse.json({ error: 'Error actualizando movimiento' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await db.transaction.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    // idempotente: si ya fue borrado, respondemos ok
    if (isRecordMissing(e)) return NextResponse.json({ ok: true })
    console.error('[transactions DELETE]', e)
    return NextResponse.json({ error: 'Error eliminando movimiento' }, { status: 500 })
  }
}
