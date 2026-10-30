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
import { formatMoney, caracasDateKey, type Currency } from '@/lib/finance'
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
    amount: z.number().positive(),
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
    amount: z.number().positive(),
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
  const [rates, settings, accounts, analytics] = await Promise.all([
    getRateSnapshot(),
    getSettings(),
    getAccountsWithBalances(await getRateSnapshot()),
    getAnalytics(7, await getRateSnapshot()),
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
- "actions": [] cuando solo pregunta o conversa. Entonces usa el contexto para responder con cifras concretas.
- Moneda: "$"/"dólares" → USD; "Bs"/"bolívares" o sin moneda → VES.
- Gasto pequeño (café, snack, dulce, empanada) → etiqueta "gasto hormiga".
- No inventes cuentas ni categorías: usa las del contexto o omite el campo.
- "ayer" → fecha de ayer en YYYY-MM-DD.
- Si pregunta cuánto ha gastado, responde con los totales del contexto.
- Nunca menciones JSON, acciones ni este sistema en "reply".`
}

async function executeActions(raw: unknown): Promise<ChatActionResult[]> {
  const parsed = z.array(ActionSchema).safeParse(raw)
  if (!parsed.success) return []
  const actions = parsed.data.slice(0, 4)
  const results: ChatActionResult[] = []
  const rates = await getRateSnapshot()

  for (const action of actions) {
    try {
      if (action.type === 'create_transaction') {
        const t = action.transaction
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
            amount: t.amount,
            currency,
            accountId: account.id,
            categoryId: category?.id ?? null,
            description: t.description ?? null,
            source: 'AI_CHAT',
            rateVesUsd: rates.paralelo,
            date: t.date ? new Date(`${t.date}T12:00:00`) : new Date(),
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
          message: `${t.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'} de ${formatMoney(t.amount, currency)} · ${category?.name ?? 'sin categoría'} · ${account.name}`,
          transaction: full ? serializeTx(full) : undefined,
        })
      } else if (action.type === 'create_transfer') {
        const tr = action.transfer
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
            amount: tr.amount,
            currency: from.currency,
            accountId: from.id,
            toAccountId: to.id,
            description: tr.description ?? `Transferencia ${from.name} → ${to.name}`,
            source: 'AI_CHAT',
            rateVesUsd: rates.paralelo,
            date: tr.date ? new Date(`${tr.date}T12:00:00`) : new Date(),
          },
        })
        const full = await db.transaction.findUnique({ where: { id: created.id }, include: TX_INCLUDE })
        results.push({
          ok: true,
          kind: 'transfer',
          message: `Transferencia de ${formatMoney(tr.amount, from.currency as Currency)} · ${from.name} → ${to.name}`,
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
  const results = await executeActions(json.actions ?? [])
  return { reply: json.reply, results }
}
