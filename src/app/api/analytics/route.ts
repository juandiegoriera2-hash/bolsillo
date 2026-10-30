import { NextResponse } from 'next/server'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { getAnalytics } from '@/lib/queries'

export async function GET(req: Request) {
  try {
    await ensureSeed()
    const { searchParams } = new URL(req.url)
    const days = Math.min(120, Math.max(1, Number(searchParams.get('days') ?? 30)))
    const rates = await getRateSnapshot()
    const analytics = await getAnalytics(days, rates)
    return NextResponse.json(analytics)
  } catch (e) {
    console.error('[analytics]', e)
    return NextResponse.json({ error: 'Error calculando analítica' }, { status: 500 })
  }
}
