import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRecordMissing } from '@/lib/api-utils'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    await db.tag.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (isRecordMissing(e)) return NextResponse.json({ ok: true })
    console.error('[tags DELETE]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
