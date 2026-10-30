import { NextResponse } from 'next/server'
import { wipeData } from '@/lib/seed'

/** mode=all → borra todo · mode=demo → borra y restaura datos demo */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode') ?? 'all'
    await wipeData(mode === 'demo')
    return NextResponse.json({ ok: true, reseeded: mode === 'demo' })
  } catch (e) {
    console.error('[data DELETE]', e)
    return NextResponse.json({ error: 'Error borrando datos' }, { status: 500 })
  }
}
