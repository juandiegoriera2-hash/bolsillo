// ─────────────────────────────────────────────────────────────────
// Bolsillo — Consultas y cálculos financieros compartidos (server)
// ─────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import {
  budgetCycleWindow,
  caracasDateKey,
  toUsd,
  type Currency,
  type RateSnapshot,
  type ValuationSource,
} from '@/lib/finance'

export type AccountWithBalance = {
  id: string
  name: string
  type: string
  currency: Currency
  color: string
  icon: string
  initialBalance: number
  balance: number
  balanceUsd: number
  txCount: number
}

/** Monto de una transacción convertido a USD (usa tasa histórica si existe) */
export function txToUsd(
  amount: number,
  currency: string,
  rateVesUsd: number | null | undefined,
  rates: RateSnapshot
): number {
  if (currency === 'USD' || currency === 'USDT') return amount
  if (currency === 'EUR') return amount * (rates.eurUsd || 1.16)
  const r = rateVesUsd ?? rates.paralelo ?? rates.bcv ?? rates.usdt ?? 1
  return amount / r
}

/** Conversión de una transacción a la moneda de un presupuesto */
export function txToBudgetCurrency(
  amount: number,
  currency: string,
  rateVesUsd: number | null | undefined,
  budgetCurrency: string,
  rates: RateSnapshot
): number {
  const usd = txToUsd(amount, currency, rateVesUsd, rates)
  if (budgetCurrency === 'USD') return usd
  const r = rates.paralelo ?? rates.bcv ?? rates.usdt ?? 1
  return usd * r
}

export async function getAccountsWithBalances(rates: RateSnapshot): Promise<AccountWithBalance[]> {
  const [accounts, incomeAgg, expenseAgg, transferOutAgg, transferInAgg, exFromAgg, exToAgg] =
    await Promise.all([
      db.account.findMany({ orderBy: { createdAt: 'asc' } }),
      db.transaction.groupBy({ by: ['accountId'], where: { type: 'INCOME' }, _sum: { amount: true } }),
      db.transaction.groupBy({ by: ['accountId'], where: { type: 'EXPENSE' }, _sum: { amount: true } }),
      db.transaction.groupBy({ by: ['accountId'], where: { type: 'TRANSFER' }, _sum: { amount: true } }),
      db.transaction.groupBy({
        by: ['toAccountId'],
        where: { type: 'TRANSFER', toAccountId: { not: null } },
        _sum: { amount: true },
      }),
      db.currencyExchange.groupBy({ by: ['fromAccountId'], _sum: { fromAmount: true } }),
      db.currencyExchange.groupBy({ by: ['toAccountId'], _sum: { toAmount: true } }),
    ])

  const sumBy = (rows: Array<Record<string, unknown>>, by: string, field: string) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r[by] as string, (r._sum?.[field] as number | undefined) ?? 0)
    return m
  }
  const income = sumBy(incomeAgg as unknown as Array<Record<string, unknown>>, 'accountId', 'amount')
  const expense = sumBy(expenseAgg as unknown as Array<Record<string, unknown>>, 'accountId', 'amount')
  const tOut = sumBy(transferOutAgg as unknown as Array<Record<string, unknown>>, 'accountId', 'amount')
  const tIn = sumBy(transferInAgg as unknown as Array<Record<string, unknown>>, 'toAccountId', 'amount')
  const eOut = sumBy(exFromAgg as unknown as Array<Record<string, unknown>>, 'fromAccountId', 'fromAmount')
  const eIn = sumBy(exToAgg as unknown as Array<Record<string, unknown>>, 'toAccountId', 'toAmount')

  const counts = await db.transaction.groupBy({ by: ['accountId'], _count: { _all: true } })
  const countMap = new Map<string, number>()
  for (const c of counts) countMap.set(c.accountId, c._count._all)

  return accounts.map((a) => {
    const balance =
      a.initialBalance +
      (income.get(a.id) ?? 0) -
      (expense.get(a.id) ?? 0) -
      (tOut.get(a.id) ?? 0) +
      (tIn.get(a.id) ?? 0) +
      (eIn.get(a.id) ?? 0) -
      (eOut.get(a.id) ?? 0)
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency as Currency,
      color: a.color,
      icon: a.icon,
      initialBalance: a.initialBalance,
      balance,
      balanceUsd: toUsd(balance, a.currency as Currency, rates),
      txCount: countMap.get(a.id) ?? 0,
    }
  })
}

export async function getNetWorth(
  rates: RateSnapshot,
  valuation: ValuationSource = 'PARALELO'
) {
  const accounts = await getAccountsWithBalances(rates)
  const byCurrency: Record<string, number> = { VES: 0, USD: 0, USDT: 0, EUR: 0 }
  let totalUsd = 0
  for (const a of accounts) {
    byCurrency[a.currency] = (byCurrency[a.currency] ?? 0) + a.balance
    totalUsd += toUsd(a.balance, a.currency, rates, valuation)
  }
  const rateKey = valuation === 'BCV' ? 'bcv' : valuation === 'USDT_P2P' ? 'usdt' : 'paralelo'
  const r = (rates as unknown as Record<string, number | null>)[rateKey] ?? rates.paralelo ?? 1
  return {
    totalUsd,
    totalVes: totalUsd * r,
    byCurrency,
    accounts,
  }
}

export type BudgetStatus = {
  id: string
  name: string
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  tagId: string | null
  tagName: string | null
  tagColor: string | null
  limitAmount: number
  currency: string
  cycle: string
  customDays: number | null
  spent: number
  remaining: number
  pct: number
  windowStart: string
  windowEnd: string
  windowLabel: string
  daysLeft: number
  active: boolean
}

export async function getBudgetStatuses(rates: RateSnapshot): Promise<BudgetStatus[]> {
  const budgets = await db.budget.findMany({
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  })
  const tagRows = await db.tag.findMany()
  const tagMap = new Map(tagRows.map((t) => [t.id, t]))
  const result: BudgetStatus[] = []
  for (const b of budgets) {
    const w = budgetCycleWindow(b)
    const txs = await db.transaction.findMany({
      where: {
        type: 'EXPENSE',
        date: { gte: w.start, lt: w.end },
        ...(b.categoryId ? { categoryId: b.categoryId } : {}),
        ...(b.tagId ? { tags: { some: { tagId: b.tagId } } } : {}),
      },
    })
    const tag = b.tagId ? tagMap.get(b.tagId) : null
    const spent = txs.reduce(
      (s, t) => s + txToBudgetCurrency(t.amount, t.currency, t.rateVesUsd, b.currency, rates),
      0
    )
    result.push({
      id: b.id,
      name: b.name,
      categoryId: b.categoryId,
      categoryName: b.category?.name ?? null,
      categoryColor: b.category?.color ?? null,
      categoryIcon: b.category?.icon ?? null,
      tagId: b.tagId ?? null,
      tagName: tag?.name ?? null,
      tagColor: tag?.color ?? null,
      limitAmount: b.limitAmount,
      currency: b.currency,
      cycle: b.cycle,
      customDays: b.customDays ?? null,
      spent,
      remaining: b.limitAmount - spent,
      pct: b.limitAmount > 0 ? Math.min(999, (spent / b.limitAmount) * 100) : 0,
      windowStart: w.start.toISOString(),
      windowEnd: w.end.toISOString(),
      windowLabel: w.label,
      daysLeft: Math.max(0, Math.ceil((w.end.getTime() - Date.now()) / 86400000)),
      active: b.active,
    })
  }
  return result
}

export type DebtWithPayments = {
  id: string
  kind: string
  person: string
  description: string | null
  amount: number
  currency: string
  dueDate: string | null
  status: string
  paid: number
  remaining: number
  overdue: boolean
  payments: Array<{ id: string; amount: number; note: string | null; date: string }>
}

export async function getDebtsWithPayments(rates: RateSnapshot): Promise<DebtWithPayments[]> {
  const debts = await db.debt.findMany({
    include: { payments: { orderBy: { date: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  })
  const now = Date.now()
  return debts.map((d) => {
    const paid = d.payments.reduce((s, p) => s + p.amount, 0)
    const remaining = Math.max(0, d.amount - paid)
    return {
      id: d.id,
      kind: d.kind,
      person: d.person,
      description: d.description,
      amount: d.amount,
      currency: d.currency,
      dueDate: d.dueDate?.toISOString() ?? null,
      status: remaining <= 0.005 ? 'SETTLED' : paid > 0 ? 'PARTIAL' : 'PENDING',
      paid,
      remaining,
      overdue: !!d.dueDate && d.dueDate.getTime() < now && remaining > 0.005,
      payments: d.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        note: p.note,
        date: p.date.toISOString(),
      })),
    }
  })
}

export type GoalWithProgress = {
  id: string
  name: string
  targetAmount: number
  currency: string
  deadline: string | null
  color: string
  icon: string
  status: string
  saved: number
  pct: number
  daysLeft: number | null
  neededPerDay: number | null
  contributions: Array<{ id: string; amount: number; note: string | null; date: string }>
}

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const goals = await db.savingsGoal.findMany({
    include: { contributions: { orderBy: { date: 'desc' } } },
    orderBy: { createdAt: 'asc' },
  })
  const now = Date.now()
  return goals.map((g) => {
    const saved = g.contributions.reduce((s, c) => s + c.amount, 0)
    const pct = g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0
    const daysLeft = g.deadline ? Math.ceil((g.deadline.getTime() - now) / 86400000) : null
    const needed = g.deadline && daysLeft && daysLeft > 0 ? (g.targetAmount - saved) / daysLeft : null
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currency: g.currency,
      deadline: g.deadline?.toISOString() ?? null,
      color: g.color,
      icon: g.icon,
      status: pct >= 100 ? 'COMPLETED' : g.status,
      saved,
      pct,
      daysLeft,
      neededPerDay: needed,
      contributions: g.contributions.map((c) => ({
        id: c.id,
        amount: c.amount,
        note: c.note,
        date: c.date.toISOString(),
      })),
    }
  })
}

export type AnalyticsResult = {
  days: number
  from: string
  to: string
  incomeUsd: number
  expenseUsd: number
  netUsd: number
  prevIncomeUsd: number
  prevExpenseUsd: number
  byCategory: Array<{ name: string; color: string; icon: string; totalUsd: number; count: number }>
  byTag: Array<{ name: string; color: string; totalUsd: number; count: number }>
  byDay: Array<{ dateKey: string; expenseUsd: number; incomeUsd: number }>
  gastosHormiga: { count: number; totalUsd: number }
  topExpenses: Array<{ id: string; description: string | null; amountUsd: number; currency: string; amount: number; date: string }>
  txCount: number
}

export async function getAnalytics(days: number, rates: RateSnapshot): Promise<AnalyticsResult> {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)
  const prevFrom = new Date(from.getTime() - days * 86400000)

  const [txs, prevTxs, categories, tagRows] = await Promise.all([
    db.transaction.findMany({
      where: { date: { gte: from, lte: to } },
      include: { category: true, tags: { include: { tag: true } } },
      orderBy: { date: 'desc' },
    }),
    db.transaction.findMany({
      where: { date: { gte: prevFrom, lt: from } },
    }),
    db.category.findMany(),
    db.tag.findMany(),
  ])

  const catMap = new Map(categories.map((c) => [c.id, c]))
  const tagMap = new Map(tagRows.map((t) => [t.id, t]))

  let incomeUsd = 0
  let expenseUsd = 0
  let prevIncomeUsd = 0
  let prevExpenseUsd = 0
  const byCat = new Map<string, { name: string; color: string; icon: string; totalUsd: number; count: number }>()
  const byTag = new Map<string, { name: string; color: string; totalUsd: number; count: number }>()
  const byDay = new Map<string, { expenseUsd: number; incomeUsd: number }>()
  let hormigaCount = 0
  let hormigaUsd = 0

  for (const t of prevTxs) {
    const usd = txToUsd(t.amount, t.currency, t.rateVesUsd, rates)
    if (t.type === 'INCOME') prevIncomeUsd += usd
    else if (t.type === 'EXPENSE') prevExpenseUsd += usd
  }

  for (const t of txs) {
    const usd = txToUsd(t.amount, t.currency, t.rateVesUsd, rates)
    if (t.type === 'INCOME') incomeUsd += usd
    else if (t.type === 'EXPENSE') {
      expenseUsd += usd
      const cat = t.category ?? catMap.get(t.categoryId ?? '')
      const ck = cat?.name ?? 'Sin categoría'
      const cur = byCat.get(ck) ?? {
        name: ck,
        color: cat?.color ?? '#94a3b8',
        icon: cat?.icon ?? 'circle-dashed',
        totalUsd: 0,
        count: 0,
      }
      cur.totalUsd += usd
      cur.count++
      byCat.set(ck, cur)

      const isHormiga =
        t.tags.some((tt) => tt.tag?.name?.toLowerCase() === 'gasto hormiga') || usd <= 1.5
      if (isHormiga) {
        hormigaCount++
        hormigaUsd += usd
      }
    }
    for (const tt of t.tags) {
      const tag = tt.tag ?? tagMap.get(tt.tagId)
      if (!tag) continue
      const cur = byTag.get(tag.name) ?? { name: tag.name, color: tag.color, totalUsd: 0, count: 0 }
      cur.totalUsd += usd
      cur.count++
      byTag.set(tag.name, cur)
    }
    const dk = caracasDateKey(t.date)
    const day = byDay.get(dk) ?? { expenseUsd: 0, incomeUsd: 0 }
    if (t.type === 'INCOME') day.incomeUsd += usd
    else if (t.type === 'EXPENSE') day.expenseUsd += usd
    byDay.set(dk, day)
  }

  // completar días vacíos
  const dayList: Array<{ dateKey: string; expenseUsd: number; incomeUsd: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const dk = caracasDateKey(new Date(to.getTime() - i * 86400000))
    const d = byDay.get(dk) ?? { expenseUsd: 0, incomeUsd: 0 }
    dayList.push({ dateKey: dk, ...d })
  }

  const topExpenses = txs
    .filter((t) => t.type === 'EXPENSE')
    .map((t) => ({
      id: t.id,
      description: t.description,
      amountUsd: txToUsd(t.amount, t.currency, t.rateVesUsd, rates),
      currency: t.currency,
      amount: t.amount,
      date: t.date.toISOString(),
    }))
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 5)

  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    incomeUsd,
    expenseUsd,
    netUsd: incomeUsd - expenseUsd,
    prevIncomeUsd,
    prevExpenseUsd,
    byCategory: [...byCat.values()].sort((a, b) => b.totalUsd - a.totalUsd),
    byTag: [...byTag.values()].sort((a, b) => b.totalUsd - a.totalUsd),
    byDay: dayList,
    gastosHormiga: { count: hormigaCount, totalUsd: hormigaUsd },
    topExpenses,
    txCount: txs.length,
  }
}

/** Preferencias del usuario guardadas en AppMeta */
export async function getSettings(): Promise<{ baseCurrency: Currency; valuationSource: ValuationSource }> {
  const rows = await db.appMeta.findMany({ where: { key: { in: ['baseCurrency', 'valuationSource'] } } })
  const get = (k: string, d: string) => rows.find((r) => r.key === k)?.value ?? d
  return {
    baseCurrency: (get('baseCurrency', 'USD') as Currency) ?? 'USD',
    valuationSource: (get('valuationSource', 'PARALELO') as ValuationSource) ?? 'PARALELO',
  }
}
