import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { chatText, aiErrorMessage } from '@/lib/ai'
import { getRateSnapshot, getRatesHistory } from '@/lib/rates'
import {
  getAnalytics,
  getBudgetStatuses,
  getDebtsWithPayments,
  getGoalsWithProgress,
  getNetWorth,
  getSettings,
} from '@/lib/queries'

export const maxDuration = 90

/** Lunes de la semana actual (UTC-4 Caracas) */
function mondayOfThisWeek(): Date {
  const now = new Date()
  // Caracas = UTC-4
  const caracas = new Date(now.getTime() - 4 * 3600000)
  const day = (caracas.getUTCDay() + 6) % 7
  const monday = new Date(caracas)
  monday.setUTCDate(monday.getUTCDate() - day)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

function buildPrompt(digest: unknown): string {
  return `Eres analista financiero de una app venezolana de finanzas personales. Escribe el informe semanal del usuario en Markdown y español, basándote SOLO en estos datos JSON:

${JSON.stringify(digest, null, 2)}

Formato EXACTO:

## 📊 Resumen de la semana
(Párrafo breve: ingreso, gasto y balance neto en $ y su equivalente en Bs con tasa paralelo. Compara con la semana anterior.)

## 🔍 Patrones detectados
(3-4 bullets concretos: categorías dominantes, gastos hormiga, cambios vs semana pasada, devaluación del bolívar en la semana)

## ⚠️ Alertas
(Bullets: presupuestos excedidos o al límite, deudas vencidas, patrones riesgosos. Si no hay: "Sin alertas esta semana ✅")

## 💡 Consejos para la próxima semana
(2-3 bullets accionables y realistas para el contexto venezolano: indexar en divisas, controlar hormiga, planificar cambios de divisa)

Reglas: tono cercano y directo, cifras concretas con $ y Bs, máximo 220 palabras, no inventes datos.`
}

export async function GET(req: Request) {
  try {
    await ensureSeed()
    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === '1'
    const monday = mondayOfThisWeek()

    if (!force) {
      const existing = await db.weeklySummary.findUnique({ where: { weekStart: monday } })
      if (existing) {
        return NextResponse.json({
          weekStart: existing.weekStart.toISOString(),
          content: existing.content,
          createdAt: existing.createdAt.toISOString(),
          cached: true,
        })
      }
    }

    const rates = await getRateSnapshot()
    const settings = await getSettings()
    const [netWorth, analytics, budgets, debts, goals, history] = await Promise.all([
      getNetWorth(rates, settings.valuationSource),
      getAnalytics(7, rates),
      getBudgetStatuses(rates),
      getDebtsWithPayments(rates),
      getGoalsWithProgress(),
      getRatesHistory(14),
    ])

    const parNow = history.at(-1)?.paralelo ?? rates.paralelo
    const parPrev = history[history.length - 8]?.paralelo ?? history[0]?.paralelo ?? parNow
    const devaluation = parNow && parPrev ? ((parNow - parPrev) / parPrev) * 100 : 0

    const digest = {
      semana: {
        ingresosUsd: Number(analytics.incomeUsd.toFixed(2)),
        gastosUsd: Number(analytics.expenseUsd.toFixed(2)),
        netoUsd: Number(analytics.netUsd.toFixed(2)),
        gastosSemanaAnteriorUsd: Number(analytics.prevExpenseUsd.toFixed(2)),
        tasaParalelo: parNow,
      },
      gastoPorCategoria: analytics.byCategory.slice(0, 6).map((c) => ({
        categoria: c.name,
        totalUsd: Number(c.totalUsd.toFixed(2)),
        movimientos: c.count,
      })),
      gastosHormiga: {
        cantidad: analytics.gastosHormiga.count,
        totalUsd: Number(analytics.gastosHormiga.totalUsd.toFixed(2)),
      },
      mayoresGastos: analytics.topExpenses.map((t) => ({
        descripcion: t.description ?? 'Sin descripción',
        montoUsd: Number(t.amountUsd.toFixed(2)),
      })),
      presupuestos: budgets.map((b) => ({
        nombre: b.name,
        limite: b.limitAmount,
        moneda: b.currency,
        gastado: Number(b.spent.toFixed(2)),
        porcentaje: Number(b.pct.toFixed(0)),
        ciclo: b.windowLabel,
      })),
      deudas: debts
        .filter((d) => d.remaining > 0.005)
        .map((d) => ({
          tipo: d.kind,
          persona: d.person,
          monto: d.amount,
          moneda: d.currency,
          restante: Number(d.remaining.toFixed(2)),
          vencida: d.overdue,
        })),
      metas: goals.map((g) => ({
        nombre: g.name,
        objetivo: g.targetAmount,
        ahorrado: Number(g.saved.toFixed(2)),
        porcentaje: Number(g.pct.toFixed(0)),
      })),
      patrimonio: { totalUsd: Number(netWorth.totalUsd.toFixed(2)), totalVes: Number(netWorth.totalVes.toFixed(0)) },
      bolivar: { devaluacionSemanalPct: Number(devaluation.toFixed(2)) },
    }

    const content = await chatText([
      { role: 'assistant', content: buildPrompt(digest) },
      { role: 'user', content: 'Genera el informe semanal ahora.' },
    ])

    const saved = await db.weeklySummary.upsert({
      where: { weekStart: monday },
      update: { content, statsJson: JSON.stringify(digest), updatedAt: new Date() },
      create: { weekStart: monday, content, statsJson: JSON.stringify(digest) },
    })

    return NextResponse.json({
      weekStart: saved.weekStart.toISOString(),
      content: saved.content,
      createdAt: saved.createdAt.toISOString(),
      cached: false,
    })
  } catch (e) {
    console.error('[ai/summary]', e)
    return NextResponse.json(
      { error: aiErrorMessage(e, 'Error generando el resumen') },
      { status: 500 }
    )
  }
}
