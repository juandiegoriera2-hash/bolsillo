import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGoalsWithProgress } from '@/lib/queries'

type Params = { params: Promise<{ id: string }> }

/** Aportar a una meta */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const amount = Number(body?.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    const goal = await db.savingsGoal.findUnique({ where: { id } })
    if (!goal) return NextResponse.json({ error: 'Meta no encontrada' }, { status: 404 })
    await db.goalContribution.create({
      data: {
        goalId: id,
        amount,
        note: body?.note ? String(body.note).slice(0, 140) : null,
        date: body?.date ? new Date(body.date) : new Date(),
      },
    })
    const all = await getGoalsWithProgress()
    return NextResponse.json(all.find((g) => g.id === id))
  } catch (e) {
    console.error('[goal contributions POST]', e)
    return NextResponse.json({ error: 'Error aportando a la meta' }, { status: 500 })
  }
}
