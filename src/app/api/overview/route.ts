import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { getRateSnapshot, getRatesHistory } from '@/lib/rates'
import {
  getAccountsWithBalances,
  getNetWorth,
  getBudgetStatuses,
  getDebtsWithPayments,
  getGoalsWithProgress,
  getAnalytics,
  getSettings,
} from '@/lib/queries'
import { serializeTx, TX_INCLUDE } from '@/lib/dto'

export async function GET() {
  try {
    await ensureSeed()
    const settings = await getSettings()
    const rates = await getRateSnapshot()
    const [netWorth, accounts, recent, budgets, debts, goals, analytics, history] =
      await Promise.all([
        getNetWorth(rates, settings.valuationSource),
        getAccountsWithBalances(rates),
        db.transaction.findMany({
          include: TX_INCLUDE,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 8,
        }),
        getBudgetStatuses(rates),
        getDebtsWithPayments(rates),
        getGoalsWithProgress(),
        getAnalytics(30, rates),
        getRatesHistory(30),
      ])

    // semana actual y previa derivadas de byDay (30d)
    const byDay = analytics.byDay
    const last7 = byDay.slice(-7)
    const prev7 = byDay.slice(-14, -7)
    const week = {
      incomeUsd: last7.reduce((s, d) => s + d.incomeUsd, 0),
      expenseUsd: last7.reduce((s, d) => s + d.expenseUsd, 0),
      prevIncomeUsd: prev7.reduce((s, d) => s + d.incomeUsd, 0),
      prevExpenseUsd: prev7.reduce((s, d) => s + d.expenseUsd, 0),
      byDay14: byDay.slice(-14),
    }

    return NextResponse.json({
      settings,
      rates,
      history,
      netWorth: {
        totalUsd: netWorth.totalUsd,
        totalVes: netWorth.totalVes,
        byCurrency: netWorth.byCurrency,
      },
      accounts,
      recent: recent.map(serializeTx),
      budgets,
      debts,
      goals,
      week,
      month: {
        incomeUsd: analytics.incomeUsd,
        expenseUsd: analytics.expenseUsd,
        byCategory: analytics.byCategory,
      },
      hormiga30: analytics.gastosHormiga,
    })
  } catch (e) {
    console.error('[overview]', e)
    return NextResponse.json({ error: 'Error cargando resumen' }, { status: 500 })
  }
}
