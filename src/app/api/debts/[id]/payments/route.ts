import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRateSnapshot } from '@/lib/rates'
import { getDebtsWithPayments } from '@/lib/queries'

type Params = { params: Promise<{ id: string }> }

/** Registrar abono parcial */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const amount = Number(body?.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    const debt = await db.debt.findUnique({ where: { id }, include: { payments: true } })
    if (!debt) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 })
    await db.debtPayment.create({
      data: {
        debtId: id,
        amount,
        note: body?.note ? String(body.note).slice(0, 140) : null,
        date: body?.date ? new Date(body.date) : new Date(),
      },
    })
    const paid = debt.payments.reduce((s, p) => s + p.amount, 0) + amount
    await db.debt.update({
      where: { id },
      data: { status: paid >= debt.amount - 0.005 ? 'SETTLED' : 'PARTIAL' },
    })
    const rates = await getRateSnapshot()
    const all = await getDebtsWithPayments(rates)
    return NextResponse.json(all.find((d) => d.id === id))
  } catch (e) {
    console.error('[debt payments POST]', e)
    return NextResponse.json({ error: 'Error registrando abono' }, { status: 500 })
  }
}

/** Eliminar un abono (query: ?paymentId=) */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('paymentId')
    if (!paymentId) return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 })
    await db.debtPayment.delete({ where: { id: paymentId } })
    const debt = await db.debt.findUnique({ where: { id }, include: { payments: true } })
    if (debt) {
      const paid = debt.payments.reduce((s, p) => s + p.amount, 0)
      await db.debt.update({
        where: { id },
        data: { status: debt.amount - paid <= 0.005 ? 'SETTLED' : paid > 0 ? 'PARTIAL' : 'PENDING' },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[debt payments DELETE]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
