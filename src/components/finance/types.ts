// ─────────────────────────────────────────────────────────────────
// Bolsillo — Tipos del cliente (espejo de los DTO del backend)
// ─────────────────────────────────────────────────────────────────
import type { Currency, RateSnapshot } from '@/lib/finance'

export type View =
  | 'dashboard'
  | 'transactions'
  | 'assistant'
  | 'scanner'
  | 'accounts'
  | 'budgets'
  | 'debts'
  | 'goals'
  | 'rates'
  | 'summary'
  | 'settings'
  | 'more'

export type Category = {
  id: string
  name: string
  kind: 'EXPENSE' | 'INCOME'
  icon: string
  color: string
  isDefault: boolean
}

export type Tag = { id: string; name: string; color: string }

export type AccountDTO = {
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

export type TxDTO = {
  id: string
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER'
  amount: number
  currency: string
  originalAmount: number | null
  originalCurrency: string | null
  rateSource: string | null
  accountId: string
  accountName: string
  accountColor: string
  accountIcon: string
  toAccountId: string | null
  toAccountName: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  description: string | null
  reference: string | null
  source: 'MANUAL' | 'AI_CHAT' | 'VOICE' | 'OCR'
  rateVesUsd: number | null
  date: string
  tags: Array<{ id: string; name: string; color: string }>
}

export type BudgetDTO = {
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
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM'
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

/** Presupuesto evaluado en un mes concreto (vista calendario) */
export type BudgetMonthDTO = {
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
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM'
  customDays: number | null
  active: boolean
  monthSpend: number
  monthAllocation: number
  monthRemaining: number
  monthPct: number
  cycleSpent: number | null
  cyclePct: number | null
  cycleLabel: string | null
  cycleDaysLeft: number | null
}

export type BudgetMonthView = {
  month: string
  monthLabel: string
  isCurrent: boolean
  budgets: BudgetMonthDTO[]
  totals: Array<{ currency: string; allocated: number; spent: number; remaining: number }>
  calendar: Array<{ dateKey: string; expenseUsd: number; txCount: number }>
  monthExpenseUsd: number
}

export type DebtDTO = {
  id: string
  kind: 'POR_PAGAR' | 'POR_COBRAR'
  person: string
  description: string | null
  amount: number
  currency: string
  dueDate: string | null
  status: 'PENDING' | 'PARTIAL' | 'SETTLED'
  paid: number
  remaining: number
  overdue: boolean
  payments: Array<{ id: string; amount: number; note: string | null; date: string }>
}

export type GoalDTO = {
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

export type ExchangeDTO = {
  id: string
  fromAccountId: string
  fromAccountName: string
  fromCurrency: string
  toAccountId: string
  toAccountName: string
  toCurrency: string
  fromAmount: number
  toAmount: number
  direction: string
  impliedRate: number
  marketRate: number
  marketSource: string
  differential: number
  differentialUsd: number
  date: string
  note: string | null
}

export type RateHistoryPoint = {
  dateKey: string
  bcv: number | null
  paralelo: number | null
  usdt: number | null
  eur: number | null
}

export type AnalyticsDTO = {
  days: number
  incomeUsd: number
  expenseUsd: number
  netUsd: number
  prevIncomeUsd: number
  prevExpenseUsd: number
  byCategory: Array<{ name: string; color: string; icon: string; totalUsd: number; count: number }>
  byTag: Array<{ name: string; color: string; totalUsd: number; count: number }>
  byDay: Array<{ dateKey: string; expenseUsd: number; incomeUsd: number }>
  gastosHormiga: { count: number; totalUsd: number }
  topExpenses: Array<{
    id: string
    description: string | null
    amountUsd: number
    currency: string
    amount: number
    date: string
  }>
  txCount: number
}

export type OverviewDTO = {
  settings: { baseCurrency: 'USD' | 'VES'; valuationSource: 'BCV' | 'PARALELO' | 'USDT_P2P' }
  rates: RateSnapshot
  history: RateHistoryPoint[]
  netWorth: { totalUsd: number; totalVes: number; byCurrency: Record<string, number> }
  accounts: AccountDTO[]
  recent: TxDTO[]
  budgets: BudgetDTO[]
  debts: DebtDTO[]
  goals: GoalDTO[]
  week: {
    incomeUsd: number
    expenseUsd: number
    prevIncomeUsd: number
    prevExpenseUsd: number
    byDay14: Array<{ dateKey: string; expenseUsd: number; incomeUsd: number }>
  }
  month: {
    incomeUsd: number
    expenseUsd: number
    byCategory: Array<{ name: string; color: string; icon: string; totalUsd: number; count: number }>
  }
  hormiga30: { count: number; totalUsd: number }
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  results?: Array<{ ok: boolean; message: string }>
  pending?: boolean
}

export type OcrPayload = {
  banco: string | null
  tipoOperacion: string | null
  monto: number | null
  moneda: string | null
  fecha: string | null
  referencia: string | null
  persona: string | null
  telefono: string | null
  detalle: string | null
  notas: string | null
}

/** Precarga para el diálogo de transacción (OCR, asistente, edición) */
export type TxBucket = {
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER'
  amount: number
  currency: Currency
  accountId: string
  toAccountId?: string
  categoryId?: string
  description: string
  reference?: string
  tagIds: string[]
  date: string
}

export type TxDialogState = {
  open: boolean
  edit?: TxDTO | null
  prefill?: Partial<TxBucket> | null
}
