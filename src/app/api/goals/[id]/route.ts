import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (Number.isFinite(Number(body?.targetAmount)) && Number(body.targetAmount) > 0)
      data.targetAmount = Number(body.targetAmount)
    if (body?.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null
    if (typeof body?.color === 'string') data.color = body.color
    if (typeof body?.icon === 'string') data.icon = body.icon
    if (['ACTIVE', 'COMPLETED'].includes(body?.status)) data.status = body.status
    const goal = await db.savingsGoal.update({ where: { id }, data })
    return NextResponse.json(goal)
  } catch (e) {
    console.error('[goals PATCH]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await db.savingsGoal.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[goals DELETE]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
