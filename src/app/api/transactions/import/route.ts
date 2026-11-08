import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { serializeTx, TX_INCLUDE } from '@/lib/dto'

/**
 * Importación masiva de movimientos desde el estado de cuenta bancario
 * (Excel/CSV descargado de la banca en línea). Cada fila llega ya parseada
 * por el cliente: { date, description, amount, reference }.
 */
export async function POST(req: Request) {
  try {
    await ensureSeed()
    const body = await req.json()
    const accountId = String(body?.accountId ?? '')
    const items = Array.isArray(body?.items) ? body.items.slice(0, 500) : []

    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })
    if (items.length === 0)
      return NextResponse.json({ error: 'No hay movimientos para importar' }, { status: 400 })

    const rates = await getRateSnapshot()
    const rateVesUsd = rates.paralelo ?? rates.bcv ?? rates.usdt ?? 1

    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const valid = items
      .map((it: Record<string, unknown>) => ({
        date: String(it?.date ?? ''),
        description: String(it?.description ?? '').slice(0, 120) || null,
        amount: Number(it?.amount),
        reference: String(it?.reference ?? '').slice(0, 40) || null,
      }))
      .filter(
        (it: { date: string; amount: number }) =>
          dateRe.test(it.date) && Number.isFinite(it.amount) && Math.abs(it.amount) > 0.004
      )
      .map((it: { date: string; description: string | null; amount: number; reference: string | null }) => ({
        ...it,
        type: it.amount > 0 ? 'INCOME' : 'EXPENSE',
        amount: Math.abs(Math.round(it.amount * 100) / 100),
      }))

    if (valid.length === 0)
      return NextResponse.json({ error: 'Ningún movimiento válido en el archivo' }, { status: 400 })

    // anti-duplicados: mismo día + mismo monto + misma descripción ya importados
    const existing = await db.transaction.findMany({
      where: { accountId, source: 'IMPORT' },
      select: { date: true, amount: true, description: true },
    })
    const existingKeys = new Set(
      existing.map(
        (t) => `${t.date.toISOString().slice(0, 10)}|${t.amount}|${(t.description ?? '').slice(0, 40)}`
      )
    )

    const toInsert = valid.filter(
      (it: { date: string; description: string | null; amount: number }) => {
        const key = `${it.date}|${it.amount}|${(it.description ?? '').slice(0, 40)}`
        return !existingKeys.has(key)
      }
    )

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, duplicates: valid.length, ok: true })
    }

    await db.transaction.createMany({
      data: toInsert.map(
        (it: { date: string; description: string | null; amount: number; type: string; reference: string | null }) => ({
          type: it.type,
          amount: it.amount,
          currency: account.currency,
          accountId,
          categoryId: null,
          description: it.description,
          reference: it.reference,
          source: 'IMPORT',
          rateVesUsd,
          date: new Date(`${it.date}T12:00:00`),
        })
      ),
    })

    // muestra de lo importado para confirmar en la UI
    const recent = await db.transaction.findMany({
      where: { accountId, source: 'IMPORT' },
      include: TX_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 3,
    })

    return NextResponse.json({
      ok: true,
      created: toInsert.length,
      duplicates: valid.length - toInsert.length,
      sample: recent.map(serializeTx),
    })
  } catch (e) {
    console.error('[transactions import]', e)
    return NextResponse.json({ error: 'Error importando movimientos' }, { status: 500 })
  }
}
