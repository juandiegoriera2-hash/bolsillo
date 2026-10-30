import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'

export async function GET() {
  try {
    await ensureSeed()
    const tags = await db.tag.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json(tags)
  } catch (e) {
    console.error('[tags GET]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    const existing = await db.tag.findFirst({ where: { name } })
    if (existing) return NextResponse.json(existing)
    const tag = await db.tag.create({
      data: { name, color: typeof body?.color === 'string' ? body.color : '#a78bfa' },
    })
    return NextResponse.json(tag)
  } catch (e) {
    console.error('[tags POST]', e)
    return NextResponse.json({ error: 'Error creando etiqueta' }, { status: 500 })
  }
}
