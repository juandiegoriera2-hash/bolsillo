// ─────────────────────────────────────────────────────────────────
// Bolsillo — Cliente HTTP tipado hacia las APIs
// ─────────────────────────────────────────────────────────────────
import type {
  AccountDTO,
  AnalyticsDTO,
  BudgetDTO,
  Category,
  DebtDTO,
  ExchangeDTO,
  GoalDTO,
  OverviewDTO,
  OcrPayload,
  RateHistoryPoint,
  Tag,
  TxDTO,
} from './types'
import type { RateSnapshot } from '@/lib/finance'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg =
      (json as { error?: string } | null)?.error ?? `Error ${res.status} en ${url.split('?')[0]}`
    throw new Error(msg)
  }
  return json as T
}

export const api = {
  // ── núcleo ──────────────────────────────────────────────
  overview: () => req<OverviewDTO>('/api/overview'),
  meta: () => req<{ categories: Category[]; tags: Tag[] }>('/api/categories'),
  analytics: (days: number) => req<AnalyticsDTO>(`/api/analytics?days=${days}`),

  // ── tasas ───────────────────────────────────────────────
  rates: () => req<{ snapshot: RateSnapshot; history: RateHistoryPoint[] }>('/api/rates'),
  refreshRates: () => req<{ ok: boolean; snapshot: RateSnapshot }>('/api/rates', {
    method: 'POST',
    body: JSON.stringify({ action: 'refresh' }),
  }),
  setRate: (source: string, usd: number, eur?: number) =>
    req<{ ok: boolean; snapshot: RateSnapshot }>('/api/rates', {
      method: 'POST',
      body: JSON.stringify({ source, usd, eur }),
    }),

  // ── cuentas ─────────────────────────────────────────────
  accounts: () => req<AccountDTO[]>('/api/accounts'),
  createAccount: (data: { name: string; type: string; currency: string; initialBalance: number; color: string; icon: string }) =>
    req<AccountDTO>('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: string, data: Record<string, unknown>) =>
    req<AccountDTO>(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id: string) => req<{ ok: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' }),

  // ── movimientos ─────────────────────────────────────────
  transactions: (params: {
    q?: string
    type?: string
    accountId?: string
    categoryId?: string
    tagId?: string
    source?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
  }) => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
    })
    return req<{
      items: TxDTO[]
      total: number
      incomeUsd: number
      expenseUsd: number
      hasMore: boolean
    }>(`/api/transactions?${sp.toString()}`)
  },
  createTransaction: (data: Record<string, unknown>) =>
    req<TxDTO>('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: Record<string, unknown>) =>
    req<TxDTO>(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTransaction: (id: string) =>
    req<{ ok: boolean }>(`/api/transactions/${id}`, { method: 'DELETE' }),

  // ── catálogo ────────────────────────────────────────────
  createCategory: (data: { name: string; kind: string; icon: string; color: string }) =>
    req<Category>('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => req<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),
  createTag: (data: { name: string; color: string }) =>
    req<Tag>('/api/tags', { method: 'POST', body: JSON.stringify(data) }),
  deleteTag: (id: string) => req<{ ok: boolean }>(`/api/tags/${id}`, { method: 'DELETE' }),

  // ── presupuestos ────────────────────────────────────────
  budgets: () => req<BudgetDTO[]>('/api/budgets'),
  createBudget: (data: Record<string, unknown>) =>
    req<BudgetDTO>('/api/budgets', { method: 'POST', body: JSON.stringify(data) }),
  updateBudget: (id: string, data: Record<string, unknown>) =>
    req<BudgetDTO>(`/api/budgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBudget: (id: string) => req<{ ok: boolean }>(`/api/budgets/${id}`, { method: 'DELETE' }),

  // ── deudas ──────────────────────────────────────────────
  debts: () => req<DebtDTO[]>('/api/debts'),
  createDebt: (data: Record<string, unknown>) =>
    req<DebtDTO>('/api/debts', { method: 'POST', body: JSON.stringify(data) }),
  updateDebt: (id: string, data: Record<string, unknown>) =>
    req<DebtDTO>(`/api/debts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDebt: (id: string) => req<{ ok: boolean }>(`/api/debts/${id}`, { method: 'DELETE' }),
  addDebtPayment: (id: string, data: { amount: number; note?: string }) =>
    req<DebtDTO>(`/api/debts/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteDebtPayment: (debtId: string, paymentId: string) =>
    req<{ ok: boolean }>(`/api/debts/${debtId}/payments?paymentId=${paymentId}`, { method: 'DELETE' }),

  // ── metas ───────────────────────────────────────────────
  goals: () => req<GoalDTO[]>('/api/goals'),
  createGoal: (data: Record<string, unknown>) =>
    req<GoalDTO>('/api/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id: string, data: Record<string, unknown>) =>
    req<GoalDTO>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteGoal: (id: string) => req<{ ok: boolean }>(`/api/goals/${id}`, { method: 'DELETE' }),
  contribute: (id: string, data: { amount: number; note?: string }) =>
    req<GoalDTO>(`/api/goals/${id}/contributions`, { method: 'POST', body: JSON.stringify(data) }),

  // ── cambios de divisa ───────────────────────────────────
  exchanges: () =>
    req<{ items: ExchangeDTO[]; gainedUsd: number; lostUsd: number; netUsd: number }>('/api/exchanges'),
  createExchange: (data: Record<string, unknown>) =>
    req<ExchangeDTO>('/api/exchanges', { method: 'POST', body: JSON.stringify(data) }),

  // ── IA ──────────────────────────────────────────────────
  chat: (message: string) =>
    req<{ reply: string; results: Array<{ ok: boolean; message: string }> }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  voice: (audioBase64: string) =>
    req<{
      transcript: string
      reply: string
      results: Array<{ ok: boolean; message: string }>
    }>('/api/ai/voice', { method: 'POST', body: JSON.stringify({ audioBase64 }) }),
  ocr: (image: string) =>
    req<OcrPayload>('/api/ai/ocr', { method: 'POST', body: JSON.stringify({ image }) }),
  summary: (force = false) =>
    req<{ weekStart: string; content: string; createdAt: string; cached: boolean }>(
      `/api/ai/summary${force ? '?force=1' : ''}`
    ),

  // ── ajustes y datos ─────────────────────────────────────
  settings: () => req<{ baseCurrency: 'USD' | 'VES'; valuationSource: string }>('/api/settings'),
  saveSettings: (data: { baseCurrency?: string; valuationSource?: string }) =>
    req<{ baseCurrency: 'USD' | 'VES'; valuationSource: string }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  wipeData: (mode: 'all' | 'demo') =>
    req<{ ok: boolean; reseeded: boolean }>(`/api/data?mode=${mode}`, { method: 'DELETE' }),
}
