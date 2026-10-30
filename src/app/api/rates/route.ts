import { NextResponse } from 'next/server'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot, getRatesHistory, refreshRates, setManualRate } from '@/lib/rates'

export async function GET() {
  try {
    await ensureSeed()
    const snapshot = await getRateSnapshot()
    const history = await getRatesHistory(30)
    return NextResponse.json({ snapshot, history })
  } catch (e) {
    console.error('[rates GET]', e)
    return NextResponse.json({ error: 'Error cargando tasas' }, { status: 500 })
  }
}

/** Refrescar desde fuentes externas (force) o fijar tasa manual */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (body?.action === 'refresh') {
      const { updated } = await refreshRates()
      const snapshot = await getRateSnapshot()
      return NextResponse.json({ ok: true, updated, snapshot })
    }
    const source = body?.source as string
    const usd = Number(body?.usd)
    if (!['BCV', 'PARALELO', 'USDT_P2P'].includes(source) || !Number.isFinite(usd) || usd <= 0) {
      return NextResponse.json({ error: 'Fuente o monto inválido' }, { status: 400 })
    }
    await setManualRate(source as 'BCV' | 'PARALELO' | 'USDT_P2P', usd, body?.eur ? Number(body.eur) : undefined)
    const snapshot = await getRateSnapshot()
    return NextResponse.json({ ok: true, snapshot })
  } catch (e) {
    console.error('[rates POST]', e)
    return NextResponse.json({ error: 'Error actualizando tasas' }, { status: 500 })
  }
}
