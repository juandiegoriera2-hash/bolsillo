import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot } from '@/lib/rates'
import { txToUsd } from '@/lib/queries'
import { resolveEntry } from '@/lib/entry'
import { serializeTx, TX_INCLUDE } from '@/lib/dto'

export async function GET(req: Request) {
  try {
    await ensureSeed()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const type = searchParams.get('type')
    const accountId = searchParams.get('accountId')
    const categoryId = searchParams.get('categoryId')
    const tagId = searchParams.get('tagId')
    const source = searchParams.get('source')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)))
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0))

    const where: Record<string, unknown> = {}
    if (q) where.description = { contains: q }
    if (type && ['EXPENSE', 'INCOME', 'TRANSFER'].includes(type)) where.type = type
    if (accountId) where.accountId = accountId
    if (categoryId) where.categoryId = categoryId
    if (source && ['MANUAL', 'AI_CHAT', 'VOICE', 'OCR', 'IMPORT'].includes(source)) where.source = source
    if (tagId) where.tags = { some: { tagId } }
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
      }
    }

    const [items, total, all] = await Promise.all([
      db.transaction.findMany({
        where,
        include: TX_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      db.transaction.count({ where }),
      db.transaction.findMany({ where, select: { type: true, amount: true, currency: true, rateVesUsd: true } }),
    ])

    const rates = await getRateSnapshot()
    let incomeUsd = 0
    let expenseUsd = 0
    for (const t of all) {
      const usd = txToUsd(t.amount, t.currency, t.rateVesUsd, rates)
      if (t.type === 'INCOME') incomeUsd += usd
      else if (t.type === 'EXPENSE') expenseUsd += usd
    }

    return NextResponse.json({
      items: items.map(serializeTx),
      total,
      incomeUsd,
      expenseUsd,
      hasMore: offset + items.length < total,
    })
  } catch (e) {
    console.error('[transactions GET]', e)
    return NextResponse.json({ error: 'Error cargando movimientos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const type = ['EXPENSE', 'INCOME', 'TRANSFER'].includes(body?.type) ? body.type : 'EXPENSE'
    const entryAmount = Number(body?.amount)
    const accountId = String(body?.accountId ?? '')
    if (!Number.isFinite(entryAmount) || entryAmount <= 0)
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })

    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })

    let toAccount = null
    if (type === 'TRANSFER') {
      toAccount = await db.account.findUnique({ where: { id: String(body?.toAccountId ?? '') } })
      if (!toAccount) return NextResponse.json({ error: 'Cuenta destino no encontrada' }, { status: 400 })
      if (toAccount.currency !== account.currency)
        return NextResponse.json(
          { error: 'Para mover entre monedas distintas usa un Cambio de divisa' },
          { status: 400 }
        )
    }

    // ── Entrada mixta: convertir a la moneda de la cuenta ──────
    // El cliente envía el monto en la moneda que escribió el usuario
    // (body.currency) + la tasa a usar (body.rateSource / body.customRate).
    const rates = await getRateSnapshot()
    const conv = resolveEntry({
      amount: entryAmount,
      entryCurrency: body?.currency,
      accountCurrency: account.currency,
      rateSource: body?.rateSource,
      customRate: body?.customRate,
      rates,
    })
    if ('error' in conv) return NextResponse.json({ error: conv.error }, { status: 400 })

    const tx = await db.transaction.create({
      data: {
        type,
        amount: conv.amount,
        currency: account.currency,
        originalAmount: conv.originalAmount,
        originalCurrency: conv.originalCurrency,
        rateSource: conv.rateSource,
        accountId,
        toAccountId: type === 'TRANSFER' ? toAccount!.id : null,
        categoryId: body?.categoryId ? String(body.categoryId) : null,
        description: body?.description ? String(body.description).slice(0, 140) : null,
        reference: body?.reference ? String(body.reference).slice(0, 60) : null,
        source: ['MANUAL', 'AI_CHAT', 'VOICE', 'OCR'].includes(body?.source) ? body.source : 'MANUAL',
        rateVesUsd: conv.rateVesUsd,
        date: body?.date ? new Date(body.date) : new Date(),
      },
      include: TX_INCLUDE,
    })

    if (Array.isArray(body?.tagIds) && body.tagIds.length > 0) {
      await db.transactionTag.createMany({
        data: body.tagIds.slice(0, 10).map((tagId: string) => ({ transactionId: tx.id, tagId })),
        skipDuplicates: true,
      })
    }

    const full = await db.transaction.findUnique({ where: { id: tx.id }, include: TX_INCLUDE })
    return NextResponse.json(serializeTx(full!))
  } catch (e) {
    console.error('[transactions POST]', e)
    return NextResponse.json({ error: 'Error creando movimiento' }, { status: 500 })
  }
}
