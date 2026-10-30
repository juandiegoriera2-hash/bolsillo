import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const count = await db.transaction.count({ where: { categoryId: id } })
    if (count > 0) {
      return NextResponse.json(
        { error: `Hay ${count} movimientos con esta categoría. Quedarán como "Sin categoría" al borrarla.` },
        { status: 400 }
      )
    }
    await db.category.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[categories DELETE]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
