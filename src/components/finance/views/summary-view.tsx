'use client'

import { formatMoney } from '@/lib/finance'

import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import { ViewHeader } from '../parts'
import { fullDate } from '../fmt'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import Markdown from 'react-markdown'
import { RefreshCw, Sparkles } from 'lucide-react'
import type { AnalyticsDTO } from '../types'

export function SummaryView() {
  const { overview } = useAppStore()
  const { toast } = useToast()
  const [data, setData] = useState<{ content: string; createdAt: string; cached: boolean } | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)

  const generate = async (force = false) => {
    if (loading) return
    setLoading(true)
    try {
      const res = await api.summary(force)
      setData(res)
      if (force) toast({ title: 'Resumen regenerado ✓' })
    } catch (e) {
      toast({ title: 'No pude generar el resumen', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api
      .summary()
      .then(setData)
      .catch(() => {})
      .finally(() => setTried(true))
    api
      .analytics(7)
      .then(setAnalytics)
      .catch(() => {})
  }, [])

  const topCat = analytics?.byCategory[0]

  return (
    <div className="pb-4">
      <ViewHeader
        title="Resumen IA semanal"
        subtitle="Análisis inteligente de tus patrones de gasto, generado cada semana"
      />

      {/* stats rápidas */}
      {analytics && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Gasto 7d</p>
            <p className="tnum text-xl font-bold">{formatMoney(analytics.expenseUsd, 'USD', false)}</p>
            <p className="text-[10px] text-muted-foreground tnum">
              vs {formatMoney(analytics.prevExpenseUsd, 'USD', false)} sem. previa
            </p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ingreso 7d</p>
            <p className="tnum text-xl font-bold text-emerald-300">{formatMoney(analytics.incomeUsd, 'USD', false)}</p>
            <p className="text-[10px] text-muted-foreground tnum">{analytics.txCount} movimientos</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">🐜 Hormiga</p>
            <p className="tnum text-xl font-bold text-rose-300">{formatMoney(analytics.gastosHormiga.totalUsd, 'USD', false)}</p>
            <p className="text-[10px] text-muted-foreground tnum">{analytics.gastosHormiga.count} pequeños gastos</p>
          </div>
        </div>
      )}

      {topCat && (
        <p className="text-xs text-muted-foreground mb-4 px-1">
          Categoría dominante: <span style={{ color: topCat.color }}>{topCat.name}</span> ({formatMoney(topCat.totalUsd, 'USD', false)} esta semana)
        </p>
      )}

      {/* contenido IA */}
      {loading && !data ? (
        <div className="glass rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-lime-400/20 to-emerald-400/20 flex items-center justify-center">
              <Sparkles size={20} className="text-lime-300 animate-pulse" />
            </span>
            <div>
              <p className="font-semibold text-sm">Analizando tu semana…</p>
              <p className="text-[11px] text-muted-foreground">Gastos, patrones, presupuestos y deudas</p>
            </div>
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : data ? (
        <div className="glass rounded-3xl p-6 relative overflow-hidden">
          <div
            className="absolute -top-20 -right-16 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, oklch(0.78 0.15 100 / 0.1), transparent 70%)' }}
          />
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-lime-400/25 to-emerald-400/25 flex items-center justify-center">
                <Sparkles size={18} className="text-lime-300" />
              </span>
              <div>
                <p className="font-semibold text-sm">Informe de la semana</p>
                <p className="text-[11px] text-muted-foreground">Generado {fullDate(data.createdAt)}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-white/10 bg-secondary/40"
              onClick={() => generate(true)}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} /> Regenerar
            </Button>
          </div>
          <div className="md-body text-sm">
            <Markdown>{data.content}</Markdown>
          </div>
        </div>
      ) : tried ? (
        <div className="glass rounded-3xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-lime-400/20 to-emerald-400/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={26} className="text-lime-300" />
          </div>
          <p className="font-semibold">Aún no hay resumen de esta semana</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            La IA analizará tus gastos, patrones, presupuestos y deudas de los últimos 7 días.
          </p>
          <Button
            onClick={() => generate(false)}
            disabled={loading}
            className="mt-5 bg-lime-400 text-lime-950 hover:bg-lime-300 font-semibold"
          >
            <Sparkles size={15} className="mr-1.5" /> {loading ? 'Generando…' : 'Generar mi resumen'}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-72 rounded-3xl" />
      )}

      {overview && (
        <p className="text-[11px] text-muted-foreground text-center mt-5">
          Basado en {analytics?.txCount ?? 0} movimientos · tasas: BCV {overview.rates.bcv?.toFixed(2)} · paralelo{' '}
          {overview.rates.paralelo?.toFixed(2)} Bs/$
        </p>
      )}
    </div>
  )
}
