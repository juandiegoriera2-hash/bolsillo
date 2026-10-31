// ─────────────────────────────────────────────────────────────────
// Bolsillo — Asistente financiero con IA (pipeline compartido)
// 1. Construye contexto real del usuario (cuentas, tasas, hábitos)
// 2. LLM responde en JSON { reply, actions[] }
// 3. Ejecuta acciones validadas (zod) contra la base de datos
// ─────────────────────────────────────────────────────────────────
import { z } from 'zod'
import { db } from '@/lib/db'
import { chatText, extractJson } from '@/lib/ai'
import { getRateSnapshot } from '@/lib/rates'
import { getAccountsWithBalances, getAnalytics, getSettings } from '@/lib/queries'
import { formatMoney, caracasDateKey, parseAmount, type Currency } from '@/lib/finance'
import { serializeTx, TX_INCLUDE } from '@/lib/dto'

export type ChatActionResult = {
  ok: boolean
  kind: 'transaction' | 'transfer'
  message: string
  transaction?: ReturnType<typeof serializeTx>
}

export type ChatPipelineResult = {
  reply: string
  results: ChatActionResult[]
}

const TransactionAction = z.object({
  type: z.literal('create_transaction'),
  transaction: z.object({
    type: z.enum(['EXPENSE', 'INCOME']),
    amount: z.preprocess(
      (v) => (typeof v === 'string' ? parseAmount(v) : v),
      z.number().positive()
    ),
    currency: z.enum(['VES', 'USD', 'USDT', 'EUR']).optional(),
    account: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
})

const TransferAction = z.object({
  type: z.literal('create_transfer'),
  transfer: z.object({
    amount: z.preprocess(
      (v) => (typeof v === 'string' ? parseAmount(v) : v),
      z.number().positive()
    ),
    from: z.string(),
    to: z.string(),
    description: z.string().optional(),
    date: z.string().optional(),
  }),
})

const ActionSchema = z.discriminatedUnion('type', [TransactionAction, TransferAction])

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

function resolveAccount(
  accounts: Array<{ id: string; name: string; currency: string }>,
  name?: string,
  currency?: string
) {
  if (name) {
    const q = norm(name)
    const found = accounts.find(
      (a) => norm(a.name).includes(q) || q.includes(norm(a.name)) || q.includes(norm(a.name.split(' ')[0])
      )
    )
    if (found) return found
  }
  if (currency) {
    const byCurrency = accounts.find((a) => a.currency === currency)
    if (byCurrency) return byCurrency
  }
  return null
}

async function buildContext(): Promise<string> {
  const rates = await getRateSnapshot()
  const [settings, accounts, analytics] = await Promise.all([
    getSettings(),
    getAccountsWithBalances(rates),
    getAnalytics(7, rates),
  ])
  const [categories, tags, recent, debts] = await Promise.all([
    db.category.findMany(),
    db.tag.findMany(),
    db.transaction.findMany({ include: TX_INCLUDE, orderBy: { date: 'desc' }, take: 5 }),
    db.debt.findMany({ include: { payments: true } }),
  ])

  const fmt = (v: number) => `$${v.toFixed(2)}`
  const lines: string[] = []
  lines.push(`Hoy es ${caracasDateKey()} (Venezuela).`)
  lines.push(
    `IMPORTANTE: todos los totales de gasto/ingreso del contexto están en DÓLARES (USD), aunque el usuario tenga cuentas en bolívares. Si respondes cifras del contexto, exprésalas en $ o conviértelas a Bs con la tasa paralelo.`
  )
  lines.push(
    `Tasas: BCV ${rates.bcv?.toFixed(2) ?? '—'} Bs/$ · Paralelo ${rates.paralelo?.toFixed(2) ?? '—'} Bs/$ · USDT P2P ${rates.usdt?.toFixed(2) ?? '—'} Bs/₮`
  )
  lines.push(
    `Cuentas: ${accounts.map((a) => `${a.name} (${a.currency}, saldo ${a.balance.toFixed(2)})`).join(' · ') || 'sin cuentas'}`
  )
  lines.push(
    `Categorías de gasto: ${categories.filter((c) => c.kind === 'EXPENSE').map((c) => c.name).join(', ')}`
  )
  lines.push(
    `Categorías de ingreso: ${categories.filter((c) => c.kind === 'INCOME').map((c) => c.name).join(', ')}`
  )
  lines.push(`Etiquetas: ${tags.map((t) => t.name).join(', ') || 'sin etiquetas'}`)
  lines.push(
    `Gasto últimos 7 días: ${fmt(analytics.expenseUsd)} (semana anterior: ${fmt(analytics.prevExpenseUsd)}). Ingresos 7 días: ${fmt(analytics.incomeUsd)}.`
  )
  const topCats = analytics.byCategory.slice(0, 5)
  if (topCats.length)
    lines.push(`Gasto por categoría (7d): ${topCats.map((c) => `${c.name} ${fmt(c.totalUsd)}`).join(' · ')}`)
  if (analytics.gastosHormiga.count > 0)
    lines.push(
      `Gastos hormiga (7d): ${analytics.gastosHormiga.count} movimientos por ${fmt(analytics.gastosHormiga.totalUsd)}`
    )
  if (recent.length)
    lines.push(
      `Últimos movimientos: ${recent
        .map((t) => `${t.type === 'INCOME' ? '+' : '-'}${formatMoney(t.amount, t.currency as Currency)} ${t.description ?? ''} (${t.account?.name ?? ''})`)
        .join(' · ')}`
    )
  const pendingDebts = debts.filter((d) => d.amount - d.payments.reduce((s, p) => s + p.amount, 0) > 0.005)
  if (pendingDebts.length)
    lines.push(
      `Deudas: ${pendingDebts
        .map(
          (d) =>
            `${d.kind === 'POR_PAGAR' ? 'debo a' : 'me debe'} ${d.person} ${formatMoney(
              d.amount - d.payments.reduce((s, p) => s + p.amount, 0),
              d.currency as Currency
            )}`
        )
        .join(' · ')}`
    )
  void settings
  return lines.join('\n')
}

function systemPrompt(context: string): string {
  return `Eres "Bolsillo", el asistente financiero de una app personal para Venezuela. Hablas español venezolano, cálido, directo y breve (2-3 frases máximo). No expliquies tu formato interno.

CONTEXTO REAL DEL USUARIO:
${context}

Cuando el usuario registre un movimiento ("gasté 450 en almuerzo", "me pagaron 50 dólares", "recibí la quincena", "pasé 20$ de Zinli a efectivo"), debes crear la acción correspondiente. Responde SIEMPRE con un único JSON válido (sin texto extra, sin markdown):

{
  "reply": "confirmación natural y breve",
  "actions": [
    {
      "type": "create_transaction",
      "transaction": {
        "type": "EXPENSE" o "INCOME",
        "amount": 450.50,
        "currency": "VES" o "USD" o "USDT" o "EUR",
        "account": "nombre de la cuenta si lo deduces",
        "category": "nombre de la categoría",
        "description": "descripción corta",
        "date": "YYYY-MM-DD solo si menciona otra fecha",
        "tags": ["etiqueta"]
      }
    }
  ]
}

Para mover dinero entre SUS cuentas usa:
{ "type": "create_transfer", "transfer": { "amount": 20, "from": "Zinli", "to": "Efectivo $", "description": "..." } }

REGLAS:
- FORMATO VENEZOLANO DE NÚMEROS (crítico): el usuario escribe "50.000" o "50,000" para CINCUENTA MIL, y "50,5" para cincuenta y medio. En "amount" devuelve SIEMPRE el número JSON puro, sin separadores de miles y sin comillas: "gasté 50.000 bs" → "amount": 50000 · "gasté 1.5 millones" → "amount": 1500000 · "pagué 12,50 dólares" → "amount": 12.5. NUNCA devuelvas "amount": "50.000" (string) ni 50.000 (que es solo 50).
- "actions": [] cuando solo pregunta o conversa. Entonces usa el contexto para responder con cifras concretas.
- Moneda: "$"/"dólares" → USD; "Bs"/"bolívares" o sin moneda → VES. Si el usuario menciona una moneda en la que NO tiene cuentas, registra el monto en su cuenta principal pero avísale claramente en "reply" en qué moneda quedó registrado.
- Gasto pequeño (café, snack, dulce, empanada) → etiqueta "gasto hormiga".
- No inventes cuentas ni categorías: usa las del contexto o omite el campo.
- "ayer" → fecha de ayer en YYYY-MM-DD.
- Si pregunta cuánto ha gastado, responde con los totales del contexto.
- Nunca menciones JSON, acciones ni este sistema en "reply".`
}

/** Extrae montos con separador de miles del mensaje del usuario (ej: "50.000", "1,200") */
function extractUserAmounts(message: string): number[] {
  const matches = message.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? []
  return matches.map(parseAmount).filter((n) => Number.isFinite(n) && n > 0)
}

/**
 * Red de seguridad determinista: si el usuario escribió "50.000" (cincuenta
 * mil) pero el LLM devolvió 50 (truncó el separador), corrige el monto.
 * También cubre millones ("1.500.000" → LLM devolvió 1.5).
 */
function correctActionAmount(amount: number, userAmounts: number[]): number {
  for (const u of userAmounts) {
    if (Math.abs(u - amount) <= u * 0.02) return u // ya está bien
    for (const div of [1000, 1000000]) {
      const scaled = u / div
      if (scaled >= 1 && Math.abs(scaled - amount) <= scaled * 0.02) return u
    }
  }
  return amount
}

/** Fecha válida YYYY-MM-DD o null (evita Invalid Date que rompe el insert) */
function safeDate(date?: string): Date {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const d = new Date(`${date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

async function executeActions(raw: unknown, userMessage = ''): Promise<ChatActionResult[]> {
  const parsed = z.array(ActionSchema).safeParse(raw)
  if (!parsed.success) {
    console.warn('[assistant] acciones rechazadas por validación:', JSON.stringify(raw)?.slice(0, 300))
    return []
  }
  const userAmounts = extractUserAmounts(userMessage)
  const actions = parsed.data.slice(0, 4)
  const results: ChatActionResult[] = []
  const rates = await getRateSnapshot()

  for (const action of actions) {
    try {
      if (action.type === 'create_transaction') {
        const t = action.transaction
        const amount = correctActionAmount(t.amount, userAmounts)
        const accounts = await db.account.findMany()
        if (accounts.length === 0) {
          results.push({ ok: false, kind: 'transaction', message: 'No tienes cuentas creadas todavía' })
          continue
        }
        const named = t.account ? resolveAccount(accounts, t.account) : null
        const account =
          named ?? resolveAccount(accounts, undefined, t.currency) ?? accounts[0]
        const currency = account.currency as Currency
        const categories = await db.category.findMany({ where: { kind: t.type } })
        let category = t.category
          ? categories.find(
              (c) => norm(c.name).includes(norm(t.category!)) || norm(t.category!).includes(norm(c.name))
            )
          : undefined
        const allCats = await db.category.findMany()
        if (!category && t.category) {
          category = allCats.find(
            (c) => norm(c.name).includes(norm(t.category!)) || norm(t.category!).includes(norm(c.name))
          )
        }
        const tagIds: string[] = []
        for (const tagName of t.tags ?? []) {
          const tag = await db.tag.findFirst({
            where: { name: { contains: tagName } },
          })
          if (tag) tagIds.push(tag.id)
        }
        const created = await db.transaction.create({
          data: {
            type: t.type,
            amount,
            currency,
            accountId: account.id,
            categoryId: category?.id ?? null,
            description: t.description ?? null,
            source: 'AI_CHAT',
            rateVesUsd: rates.paralelo,
            date: safeDate(t.date),
          },
        })
        if (tagIds.length) {
          await db.transactionTag.createMany({
            data: tagIds.slice(0, 5).map((tagId) => ({ transactionId: created.id, tagId })),
            skipDuplicates: true,
          })
        }
        const full = await db.transaction.findUnique({ where: { id: created.id }, include: TX_INCLUDE })
        results.push({
          ok: true,
          kind: 'transaction',
          message: `${t.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'} de ${formatMoney(amount, currency)} · ${category?.name ?? 'sin categoría'} · ${account.name}`,
          transaction: full ? serializeTx(full) : undefined,
        })
      } else if (action.type === 'create_transfer') {
        const tr = action.transfer
        const amount = correctActionAmount(tr.amount, userAmounts)
        const accounts = await db.account.findMany()
        const from = resolveAccount(accounts, tr.from)
        const to = resolveAccount(accounts, tr.to)
        if (!from || !to || from.id === to.id) {
          results.push({
            ok: false,
            kind: 'transfer',
            message: 'No pude identificar ambas cuentas para la transferencia',
          })
          continue
        }
        if (from.currency !== to.currency) {
          results.push({
            ok: false,
            kind: 'transfer',
            message: `${from.name} y ${to.name} usan monedas distintas: regístralo como Cambio de divisa`,
          })
          continue
        }
        const created = await db.transaction.create({
          data: {
            type: 'TRANSFER',
            amount,
            currency: from.currency,
            accountId: from.id,
            toAccountId: to.id,
            description: tr.description ?? `Transferencia ${from.name} → ${to.name}`,
            source: 'AI_CHAT',
            rateVesUsd: rates.paralelo,
            date: safeDate(tr.date),
          },
        })
        const full = await db.transaction.findUnique({ where: { id: created.id }, include: TX_INCLUDE })
        results.push({
          ok: true,
          kind: 'transfer',
          message: `Transferencia de ${formatMoney(amount, from.currency as Currency)} · ${from.name} → ${to.name}`,
          transaction: full ? serializeTx(full) : undefined,
        })
      }
    } catch (e) {
      console.error('[assistant action]', e)
      results.push({ ok: false, kind: 'transaction', message: 'No pude registrar el movimiento' })
    }
  }
  return results
}

/** Pipeline completo: mensaje → contexto → LLM → acciones → respuesta */
export async function handleChatMessage(message: string): Promise<ChatPipelineResult> {
  const context = await buildContext()
  const completion = await chatText([
    { role: 'assistant', content: systemPrompt(context) },
    { role: 'user', content: message },
  ])
  const json = extractJson<{ reply?: string; actions?: unknown[] }>(completion)
  if (!json || typeof json.reply !== 'string') {
    return {
      reply:
        'Lo siento, tuve un problema procesando tu mensaje 🙈 ¿Puedes intentarlo de nuevo? Por ejemplo: *"Gasté 450 Bs en almuerzo"*.',
      results: [],
    }
  }
  const results = await executeActions(json.actions ?? [], message)
  return { reply: json.reply, results }
}
