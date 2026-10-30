import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'

export async function GET() {
  try {
    await ensureSeed()
    const [categories, tags] = await Promise.all([
      db.category.findMany({ orderBy: [{ kind: 'desc' }, { name: 'asc' }] }),
      db.tag.findMany({ orderBy: { name: 'asc' } }),
    ])
    return NextResponse.json({ categories, tags })
  } catch (e) {
    console.error('[categories GET]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    const category = await db.category.create({
      data: {
        name,
        kind: body?.kind === 'INCOME' ? 'INCOME' : 'EXPENSE',
        icon: typeof body?.icon === 'string' ? body.icon : 'circle-dashed',
        color: typeof body?.color === 'string' ? body.color : '#38e07f',
      },
    })
    return NextResponse.json(category)
  } catch (e) {
    console.error('[categories POST]', e)
    return NextResponse.json({ error: 'Error creando categoría' }, { status: 500 })
  }
}
