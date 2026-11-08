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
import { getAccountsWithBalances, getAnalytics, getBudgetStatuses, getSettings } from '@/lib/queries'
import {
  caracasDateKey,
  convertCurrency,
  convertEntry,
  entryRate,
  formatMoney,
  parseAmount,
  vesRate,
  type Currency,
  type RateChoice,
  type RateSnapshot,
  type ValuationSource,
} from '@/lib/finance'
import { serializeTx, TX_INCLUDE } from '@/lib/dto'

export type ChatActionResult = {
  ok: boolean
  kind: 'transaction' | 'transfer' | 'budget' | 'account'
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
    currency: z.enum(['VES', 'USD', 'USDT', 'EUR']).optional(),
    from: z.string(),
    to: z.string(),
    description: z.string().optional(),
    date: z.string().optional(),
  }),
})

const BudgetAction = z.object({
  type: z.literal('create_budget'),
  budget: z.object({
    name: z.string().min(1),
    limitAmount: z.preprocess(
      (v) => (typeof v === 'string' ? parseAmount(v) : v),
      z.number().positive()
    ),
    currency: z.enum(['USD', 'VES']).optional(),
    cycle: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
    customDays: z.number().int().min(1).max(365).optional(),
    category: z.string().optional(),
    tag: z.string().optional(),
  }),
})

const CreateAccountAction = z.object({
  type: z.literal('create_account'),
  account: z.object({
    name: z.string().min(1),
    currency: z.enum(['VES', 'USD', 'USDT', 'EUR']).optional(),
    accountType: z.enum(['BANK', 'CASH', 'WALLET', 'CRYPTO', 'BINANCE']).optional(),
    initialBalance: z.preprocess(
      (v) => (typeof v === 'string' ? parseAmount(v) : v),
      z.number().min(0).optional()
    ).optional(),
  }),
})

const ActionSchema = z.discriminatedUnion('type', [
  TransactionAction,
  TransferAction,
  BudgetAction,
  CreateAccountAction,
])

const CYCLE_LABEL: Record<string, string> = {
  WEEKLY: 'semana',
  BIWEEKLY: 'quincena',
  MONTHLY: 'mes',
  CUSTOM: 'ciclo personalizado',
}

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

/** Etiqueta corta de la fuente de tasa (para las notas de conversión) */
const RATE_SOURCE_LABEL: Record<ValuationSource, string> = {
  BCV: 'BCV',
  PARALELO: 'paralelo',
  USDT_P2P: 'USDT',
}

/**
 * Fuente de tasa para la conversión automática de divisa. El usuario
 * referencia sus montos en dólares a la tasa BCV del día ("dólares BCV");
 * si menciona paralelo o binance, se respeta. Por defecto: BCV oficial.
 */
function detectRateSource(message: string): ValuationSource {
  const m = norm(message)
  if (m.includes('bcv') || m.includes('oficial') || m.includes('banco central')) return 'BCV'
  if (m.includes('paralel')) return 'PARALELO'
  if (m.includes('binance') || m.includes('p2p') || m.includes('usdt')) return 'USDT_P2P'
  return 'BCV'
}

/**
 * Moneda mencionada explícitamente por el usuario (red de seguridad
 * determinista por si el LLM omite el campo "currency").
 */
function detectCurrency(message: string): Currency | null {
  const m = norm(message)
  if (/\$\d|\d\s?\$|dolares?|\busd\b/.test(m)) return 'USD'
  if (/usdt|binance|tether/.test(m)) return 'USDT'
  if (/euros?|\beur\b/.test(m)) return 'EUR'
  if (/\bbs\b|bolivares?|\bves\b/.test(m)) return 'VES'
  return null
}

/** Resultado de una conversión automática de divisa */
type ConversionResult = { converted: number; note: string; eqNote: string; rate: number }

/**
 * Convierte `amount` de `from` a `to` con la tasa del día detectada del
 * mensaje (BCV por defecto). Ej: $12 con cuenta en Bs a BCV 889,26
 * → Bs 10.671. Devuelve las notas para el chip y la descripción, o null
 * si `from === to` o la conversión no es válida.
 */
function autoConvert(
  amount: number,
  from: Currency,
  to: Currency,
  message: string,
  rates: RateSnapshot
): ConversionResult | null {
  if (from === to) return null
  const source = detectRateSource(message)
  const rate = vesRate(rates, source)
  const converted = Math.round(convertCurrency(amount, from, to, rates, source) * 100) / 100
  if (!Number.isFinite(converted) || converted <= 0) return null
  const label = RATE_SOURCE_LABEL[source]
  return {
    converted,
    note: ` · ${formatMoney(amount, from)} → ${formatMoney(converted, to)} (${label} ${rate.toFixed(2)})`,
    eqNote: `equiv. ${formatMoney(amount, from)} · ${label} ${rate.toFixed(2)}`,
    rate,
  }
}

async function buildContext(): Promise<string> {
  const rates = await getRateSnapshot()
  const [settings, accounts, analytics, budgets] = await Promise.all([
    getSettings(),
    getAccountsWithBalances(rates),
    getAnalytics(7, rates),
    getBudgetStatuses(rates),
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
    settings.baseCurrency === 'VES'
      ? `IMPORTANTE: los totales de gasto/ingreso del contexto están en DÓLARES (USD), pero el patrimonio del usuario se muestra NATURALMENTE en BOLÍVARES (Bs). Si respondes cifras, exprésalas en Bs (conviértelas con la tasa paralelo); el equivalente en $ solo si aporta.`
      : `IMPORTANTE: todos los totales de gasto/ingreso del contexto están en DÓLARES (USD). Si respondes cifras del contexto, exprésalas en $.`
  )
  lines.push(
    `Tasas: BCV ${rates.bcv?.toFixed(2) ?? '—'} Bs/$ · Paralelo ${rates.paralelo?.toFixed(2) ?? '—'} Bs/$ · USDT P2P ${rates.usdt?.toFixed(2) ?? '—'} Bs/₮`
  )
  lines.push(
    `Cuentas: ${accounts.map((a) => `${a.name} (${a.currency}, saldo ${formatMoney(a.balance, a.currency)})`).join(' · ') || 'sin cuentas'}`
  )
  lines.push(
    `Categorías de gasto: ${categories.filter((c) => c.kind === 'EXPENSE').map((c) => c.name).join(', ')}`
  )
  lines.push(
    `Categorías de ingreso: ${categories.filter((c) => c.kind === 'INCOME').map((c) => c.name).join(', ')}`
  )
  lines.push(`Etiquetas: ${tags.map((t) => t.name).join(', ') || 'sin etiquetas'}`)
  if (budgets.length)
    lines.push(
      `Presupuestos: ${budgets
        .map(
          (b) =>
            `${b.name} (${formatMoney(b.limitAmount, b.currency as Currency)} por ${
              CYCLE_LABEL[b.cycle] ?? 'mes'
            }, gastado ${formatMoney(b.spent, b.currency as Currency)} de ${formatMoney(
              b.limitAmount,
              b.currency as Currency
            )} en ${b.cycle === 'MONTHLY' ? 'el mes' : 'el ciclo'})`
        )
        .join(' · ')}`
    )
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

Para mover dinero entre SUS cuentas (misma moneda o monedas distintas) usa:
{ "type": "create_transfer", "transfer": { "amount": 20, "currency": "USD", "from": "Zinli", "to": "Efectivo $", "description": "..." } }
Si las cuentas usan MONEDAS DISTINTAS (ej: Bs de Mercantil a Binance USDT, o dólares BCV a Binance), igual usa create_transfer: el sistema convierte solo con la tasa del día (BCV por defecto; paralelo o Binance si el usuario lo dice) y el monto queda FIJO en la moneda destino. Anúncialo con ambos montos (ej: "pasé los Bs 500.000 de Mercantil a Binance: quedaron ₮501 fijos").

Para crear o ajustar presupuestos usa:
{ "type": "create_budget", "budget": { "name": "Mercado", "limitAmount": 200, "currency": "USD" o "VES", "cycle": "MONTHLY" o "WEEKLY" o "BIWEEKLY" o "CUSTOM", "customDays": 15, "category": "Comida y bebidas", "tag": "gasto hormiga" } }

Para crear cuentas o billeteras nuevas ("agrégame una cuenta", "crea una cuenta de X") usa:
{ "type": "create_account", "account": { "name": "Banco Provincial", "currency": "VES" o "USD" o "USDT" o "EUR", "accountType": "BANK" o "CASH" o "WALLET" o "CRYPTO" o "BINANCE", "initialBalance": 0 } }

REGLAS:
- FORMATO VENEZOLANO DE NÚMEROS (crítico): el usuario escribe "50.000" o "50,000" para CINCUENTA MIL, y "50,5" para cincuenta y medio. En "amount" devuelve SIEMPRE el número JSON puro, sin separadores de miles y sin comillas: "gasté 50.000 bs" → "amount": 50000 · "gasté 1.5 millones" → "amount": 1500000 · "pagué 12,50 dólares" → "amount": 12.5. NUNCA devuelvas "amount": "50.000" (string) ni 50.000 (que es solo 50).
- "actions": [] cuando solo pregunta o conversa. Entonces usa el contexto para responder con cifras concretas.
- Moneda: "$"/"dólares" → USD; "Bs"/"bolívares" → VES; "usdt" → USDT; "€"/"euros" → EUR. Devuelve "currency" SIEMPRE que el usuario mencione una moneda; si no menciona ninguna, omite el campo.
- CONVERSIÓN AUTOMÁTICA: si la moneda del monto no coincide con la de la cuenta destino, el sistema la convierte solo con la tasa del día (BCV por defecto; paralelo o binance si el usuario lo pide) y la registra en la moneda de la cuenta. Anúncialo en "reply" con el monto original y su equivalente aproximado (ej: "anoté los $12, que a BCV de hoy son unos Bs 10.671"). No calcules de memoria con precisión: el sistema convierte exacto.
- CUENTAS: si el usuario pide crear una cuenta o billetera ("agrégame una cuenta", "crea una cuenta de X"), usa create_account. Si menciona "Binance" y no existe en el contexto, créala con accountType "BINANCE" y currency "USDT". La cuenta Binance USDT es su cuenta fija de cripto: el patrimonio se muestra separado (cuentas en Bs + Binance en USDT).
- Gasto pequeño (café, snack, dulce, empanada) → etiqueta "gasto hormiga".
- PRESUPUESTOS: cuando el usuario pida "ponme un presupuesto de X para Y", "límite de X en Y", "quiero controlar X", crea un create_budget. Ciclo por defecto MONTHLY (usa WEEKLY solo si dice "semanal", BIWEEKLY si dice "quincenal"). Moneda del límite por defecto USD (indexado) salvo que diga Bs/bolívares. "category"/"tag" solo si el presupuesto aplica a una categoría o etiqueta del contexto; si es para el gasto total, omítelos. Usa un nombre corto y claro ("Mercado", "Café", "Transporte"). Si ya existe un presupuesto con ese nombre, el sistema actualiza su límite en vez de duplicarlo.
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
        let amount = correctActionAmount(t.amount, userAmounts)
        const accounts = await db.account.findMany({ orderBy: { createdAt: 'asc' } })
        if (accounts.length === 0) {
          results.push({ ok: false, kind: 'transaction', message: 'No tienes cuentas creadas todavía' })
          continue
        }
        const named = t.account ? resolveAccount(accounts, t.account) : null
        const account = named ?? resolveAccount(accounts, undefined, t.currency) ?? accounts[0]
        const currency = account.currency as Currency

        // ── Conversión automática de divisa ──────────────────────
        // "gasté 12$ BCV" con cuenta en Bs → 12 × 889,26 = Bs 10.671.
        // Si el LLM omite "currency", se deduce del mensaje del usuario.
        const srcCurrency = (t.currency ?? detectCurrency(userMessage) ?? currency) as Currency
        let rateVesUsd = rates.paralelo ?? rates.bcv ?? rates.usdt ?? 1
        let conversionNote = ''
        let description = t.description ?? null
        const entryAmount = amount
        const conv = autoConvert(amount, srcCurrency, currency, userMessage, rates)
        let originalAmount: number | null = null
        let originalCurrency: string | null = null
        let rateSource: string | null = null
        if (conv) {
          conversionNote = conv.note
          description = description ? `${description} (${conv.eqNote})` : conv.eqNote
          amount = conv.converted
          rateVesUsd = conv.rate
          originalAmount = entryAmount
          originalCurrency = srcCurrency
          rateSource = detectRateSource(userMessage)
        }
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
            originalAmount,
            originalCurrency,
            rateSource,
            accountId: account.id,
            categoryId: category?.id ?? null,
            description,
            source: 'AI_CHAT',
            rateVesUsd,
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
          message: `${t.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'} de ${formatMoney(amount, currency)}${conversionNote} · ${category?.name ?? 'sin categoría'} · ${account.name}`,
          transaction: full ? serializeTx(full) : undefined,
        })
      } else if (action.type === 'create_transfer') {
        const tr = action.transfer
        let amount = correctActionAmount(tr.amount, userAmounts)
        const accounts = await db.account.findMany({ orderBy: { createdAt: 'asc' } })
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
        const fromCurrency = from.currency as Currency
        const toCurrency = to.currency as Currency

        // ── Transferencia entre monedas distintas ───────────────
        // El sistema convierte con la tasa del día y el monto queda FIJO
        // en la moneda destino (como hace Binance P2P).
        if (fromCurrency !== toCurrency) {
          const srcCurrency = (tr.currency ?? detectCurrency(userMessage) ?? fromCurrency) as Currency
          const source = detectRateSource(userMessage)
          const choice: RateChoice = source === 'BCV' ? 'BCV' : source === 'USDT_P2P' ? 'USDT_P2P' : 'PARALELO'
          const eurUsd = rates.eurUsd || 1.16
          // monto ingresado → moneda de la cuenta origen
          const fromRate = entryRate(rates, choice, srcCurrency, fromCurrency)
          const fromAmount =
            srcCurrency === fromCurrency
              ? amount
              : Math.round(convertEntry(amount, srcCurrency, fromCurrency, fromRate, eurUsd) * 100) / 100
          // moneda origen → moneda destino (misma tasa)
          const rate = entryRate(rates, choice, fromCurrency, toCurrency)
          const toAmount =
            Math.round(convertEntry(fromAmount, fromCurrency, toCurrency, rate, eurUsd) * 100) / 100
          if (
            !Number.isFinite(fromAmount) || fromAmount <= 0 ||
            !Number.isFinite(toAmount) || toAmount <= 0 || !Number.isFinite(rate) || rate <= 0
          ) {
            results.push({
              ok: false,
              kind: 'transfer',
              message: 'No pude calcular la conversión de monedas para esa transferencia',
            })
            continue
          }
          // diferencial vs mercado (igual que Cambio de divisa)
          const marketRateFor = (c: string): number => {
            const usd = source === 'BCV' ? rates.bcv : source === 'USDT_P2P' ? rates.usdt : rates.paralelo
            if (c === 'USD') return usd ?? rates.paralelo ?? 1
            if (c === 'USDT') return rates.usdt ?? usd ?? 1
            if (c === 'EUR') return usd ? usd * eurUsd : 1
            return 1
          }
          let direction: string
          let impliedRate: number
          let marketRate: number
          let differential: number
          if (fromCurrency === 'VES' && toCurrency !== 'VES') {
            direction = 'BUY_FOREIGN'
            impliedRate = fromAmount / toAmount
            marketRate = marketRateFor(toCurrency)
            differential = (marketRate - impliedRate) * toAmount
          } else if (fromCurrency !== 'VES' && toCurrency === 'VES') {
            direction = 'SELL_FOREIGN'
            impliedRate = toAmount / fromAmount
            marketRate = marketRateFor(fromCurrency)
            differential = (impliedRate - marketRate) * fromAmount
          } else {
            direction = 'FOREIGN_TO_FOREIGN'
            impliedRate = toAmount / fromAmount
            marketRate = marketRateFor(fromCurrency) / (marketRateFor(toCurrency) || 1)
            differential = (impliedRate - marketRate) * fromAmount
          }
          await db.currencyExchange.create({
            data: {
              fromAccountId: from.id,
              toAccountId: to.id,
              fromCurrency,
              toCurrency,
              fromAmount,
              toAmount,
              direction,
              impliedRate,
              marketRate,
              marketSource: choice,
              differential,
              date: safeDate(tr.date),
              note: tr.description ?? `${from.name} → ${to.name}`,
            },
          })
          const srcLabel = srcCurrency !== fromCurrency ? ` (anotaste ${formatMoney(amount, srcCurrency)})` : ''
          results.push({
            ok: true,
            kind: 'transfer',
            message: `Transferencia convertida: ${formatMoney(fromAmount, fromCurrency)} de ${from.name} → ${formatMoney(toAmount, toCurrency)} en ${to.name} (queda fijo) · ${RATE_SOURCE_LABEL[source]} ${vesRate(rates, source).toFixed(2)}${srcLabel}`,
          })
          continue
        }

        // ── Transferencia misma moneda ──────────────────────

        // ── Conversión automática (monto en otra moneda) ─────────
        const srcCurrency = (tr.currency ?? detectCurrency(userMessage) ?? fromCurrency) as Currency
        let rateVesUsd = rates.paralelo ?? rates.bcv ?? rates.usdt ?? 1
        let conversionNote = ''
        const entryAmount = amount
        const conv = autoConvert(amount, srcCurrency, fromCurrency, userMessage, rates)
        let originalAmount: number | null = null
        let originalCurrency: string | null = null
        let rateSource: string | null = null
        if (conv) {
          conversionNote = conv.note
          amount = conv.converted
          rateVesUsd = conv.rate
          originalAmount = entryAmount
          originalCurrency = srcCurrency
          rateSource = detectRateSource(userMessage)
        }
        const created = await db.transaction.create({
          data: {
            type: 'TRANSFER',
            amount,
            currency: fromCurrency,
            originalAmount,
            originalCurrency,
            rateSource,
            accountId: from.id,
            toAccountId: to.id,
            description: tr.description ?? `Transferencia ${from.name} → ${to.name}`,
            source: 'AI_CHAT',
            rateVesUsd,
            date: safeDate(tr.date),
          },
        })
        const full = await db.transaction.findUnique({ where: { id: created.id }, include: TX_INCLUDE })
        results.push({
          ok: true,
          kind: 'transfer',
          message: `Transferencia de ${formatMoney(amount, fromCurrency)}${conversionNote} · ${from.name} → ${to.name}`,
          transaction: full ? serializeTx(full) : undefined,
        })
      } else if (action.type === 'create_budget') {
        const b = action.budget
        const limit = correctActionAmount(b.limitAmount, userAmounts)
        const currency: 'USD' | 'VES' =
          b.currency ?? (detectCurrency(userMessage) === 'VES' ? 'VES' : 'USD')
        const cycle = b.cycle ?? 'MONTHLY'

        // categoría (fuzzy, igual que en movimientos)
        let categoryId: string | null = null
        let categoryName: string | null = null
        if (b.category) {
          const expenseCats = await db.category.findMany({ where: { kind: 'EXPENSE' } })
          const allCats = expenseCats.length ? expenseCats : await db.category.findMany()
          const cat = allCats.find(
            (c) => norm(c.name).includes(norm(b.category!)) || norm(b.category!).includes(norm(c.name))
          )
          categoryId = cat?.id ?? null
          categoryName = cat?.name ?? null
        }
        let tagId: string | null = null
        let tagName: string | null = null
        if (b.tag) {
          const tag = await db.tag.findFirst({ where: { name: { contains: b.tag } } })
          tagId = tag?.id ?? null
          tagName = tag?.name ?? null
        }

        const name = b.name.trim()
        const existing = await db.budget.findMany()
        const dup = existing.find((x) => norm(x.name) === norm(name))
        const cycleLabel = CYCLE_LABEL[cycle] ?? 'mes'
        if (dup) {
          await db.budget.update({
            where: { id: dup.id },
            data: {
              limitAmount: limit,
              currency,
              cycle,
              customDays: cycle === 'CUSTOM' ? (b.customDays ?? dup.customDays ?? 30) : null,
              ...(categoryId ? { categoryId } : {}),
              ...(tagId ? { tagId } : {}),
            },
          })
        } else {
          await db.budget.create({
            data: {
              name,
              categoryId,
              tagId,
              limitAmount: limit,
              currency,
              cycle,
              customDays: cycle === 'CUSTOM' ? (b.customDays ?? 30) : null,
              startDate: new Date(),
            },
          })
        }
        const scope = categoryName
          ? ` · ${categoryName}`
          : tagName
            ? ` · #${tagName}`
            : ' · todos los gastos'
        results.push({
          ok: true,
          kind: 'budget',
          message: `${dup ? 'Presupuesto actualizado' : 'Presupuesto creado'}: "${name}" · ${formatMoney(
            limit,
            currency
          )} por ${cycleLabel}${scope}`,
        })
      } else if (action.type === 'create_account') {
        const a = action.account
        const name = a.name.trim().slice(0, 40)
        const existing = await db.account.findMany()
        const dup = existing.find((x) => norm(x.name) === norm(name))
        if (dup) {
          results.push({ ok: false, kind: 'account', message: `Ya tienes la cuenta "${dup.name}" (${dup.currency})` })
          continue
        }
        const nName = norm(name)
        const isBinance = nName.includes('binance') || nName.includes('usdt') || a.accountType === 'BINANCE'
        const currency: Currency = a.currency ?? (isBinance ? 'USDT' : 'VES')
        const accountType = a.accountType ?? (isBinance ? 'BINANCE' : 'BANK')
        const created = await db.account.create({
          data: {
            name,
            type: accountType,
            currency,
            initialBalance: a.initialBalance ?? 0,
            color: accountType === 'BINANCE' ? '#f0b90b' : accountType === 'CASH' ? '#fb923c' : '#10b981',
            icon: accountType === 'BINANCE' ? 'bitcoin' : accountType === 'CASH' ? 'banknote' : 'landmark',
          },
        })
        const initialNote = a.initialBalance && a.initialBalance > 0 ? ` · saldo inicial ${formatMoney(a.initialBalance, currency)}` : ''
        results.push({
          ok: true,
          kind: 'account',
          message: `Cuenta "${created.name}" creada · ${currency === 'VES' ? 'bolívares' : currency === 'USD' ? 'dólares' : currency === 'EUR' ? 'euros' : 'USDT'}${initialNote}`,
        })
      }
    } catch (e) {
      console.error('[assistant action]', e)
      results.push({ ok: false, kind: 'transaction', message: 'No pude completar la acción' })
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
