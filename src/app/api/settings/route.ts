import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getSettings } from '@/lib/queries'

export async function GET() {
  try {
    await ensureSeed()
    return NextResponse.json(await getSettings())
  } catch (e) {
    console.error('[settings GET]', e)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const entries: Array<[string, string]> = []
    if (body?.baseCurrency && ['USD', 'VES'].includes(body.baseCurrency)) {
      entries.push(['baseCurrency', body.baseCurrency])
    }
    if (body?.valuationSource && ['BCV', 'PARALELO', 'USDT_P2P'].includes(body.valuationSource)) {
      entries.push(['valuationSource', body.valuationSource])
    }
    for (const [key, value] of entries) {
      await db.appMeta.upsert({ where: { key }, update: { value }, create: { key, value } })
    }
    return NextResponse.json(await getSettings())
  } catch (e) {
    console.error('[settings PUT]', e)
    return NextResponse.json({ error: 'Error guardando ajustes' }, { status: 500 })
  }
}
