import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getGoalsWithProgress } from '@/lib/queries'

export async function GET() {
  try {
    await ensureSeed()
    const goals = await getGoalsWithProgress()
    return NextResponse.json(goals)
  } catch (e) {
    console.error('[goals GET]', e)
    return NextResponse.json({ error: 'Error cargando metas' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = String(body?.name ?? '').trim()
    const targetAmount = Number(body?.targetAmount)
    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0)
      return NextResponse.json({ error: 'Nombre y objetivo son obligatorios' }, { status: 400 })
    const goal = await db.savingsGoal.create({
      data: {
        name,
        targetAmount,
        currency: ['USD', 'VES', 'EUR', 'USDT'].includes(body?.currency) ? body.currency : 'USD',
        deadline: body?.deadline ? new Date(body.deadline) : null,
        color: typeof body?.color === 'string' ? body.color : '#38e07f',
        icon: typeof body?.icon === 'string' ? body.icon : 'target',
      },
    })
    return NextResponse.json(goal)
  } catch (e) {
    console.error('[goals POST]', e)
    return NextResponse.json({ error: 'Error creando meta' }, { status: 500 })
  }
}
