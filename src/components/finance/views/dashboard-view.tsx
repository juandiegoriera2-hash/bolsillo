'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import {
  BudgetBar,
  CatIcon,
  CurrencyBadge,
  EmptyState,
  Money,
  RateCard,
  SectionTitle,
  SourceBadge,
  TxTypeIcon,
} from '../parts'
import { dateKeyShort, dayLabel } from '../fmt'
import { formatMoney, formatRate, type Currency } from '@/lib/finance'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  ArrowLeftRight,
  ArrowUpRight,
  Camera,
  ChevronRight,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

export function DashboardView() {
  const { overview, loadingOverview, refreshOverview, openTxDialog, setView } = useAppStore()
  const { toast } = useToast()
  // el patrimonio se muestra nativamente en la moneda base del usuario
  // (Bs por defecto en Venezuela); el toggle solo sobreescribe en la sesión
  const [showBsOverride, setShowBsOverride] = useState<boolean | null>(null)
  const showBs = showBsOverride ?? (overview?.settings.baseCurrency === 'VES')
  const [refreshing, setRefreshing] = useState(false)

  const rates = overview?.rates
  const history = overview?.history ?? []
  const prevDay = history.length >= 2 ? history[history.length - 2] : null

  const delta = (key: 'bcv' | 'paralelo' | 'usdt' | 'eurBcv') => {
    if (!rates || !prevDay) return null
    const now = key === 'eurBcv' ? rates.eurBcv : rates[key]
    const before = key === 'eurBcv' ? prevDay.eur : prevDay[key]
    if (!now || !before) return null
    return ((now - before) / before) * 100
  }

  const byDay14 = overview?.week.byDay14 ?? []
  const chartData = byDay14.map((d) => ({
    day: dateKeyShort(d.dateKey),
    gasto: +d.expenseUsd.toFixed(2),
    ingreso: +d.incomeUsd.toFixed(2),
  }))

  const donutData = useMemo(() => {
    const cats = overview?.month.byCategory ?? []
    const top = cats.slice(0, 5)
    const rest = cats.slice(5).reduce((s, c) => s + c.totalUsd, 0)
    const data = top.map((c) => ({ name: c.name, value: +c.totalUsd.toFixed(2), color: c.color }))
    if (rest > 0.01) data.push({ name: 'Otros', value: +rest.toFixed(2), color: '#475569' })
    return data
  }, [overview])

  const pendingDebts = (overview?.debts ?? []).filter((d) => d.remaining > 0.005)
  const porPagar = pendingDebts.filter((d) => d.kind === 'POR_PAGAR')
  const porCobrar = pendingDebts.filter((d) => d.kind === 'POR_COBRAR')
  const debtUsd = (d: (typeof pendingDebts)[number]) => {
    const r = d.currency === 'VES' ? (rates?.paralelo ?? 1) : d.currency === 'EUR' ? (rates?.eurUsd ?? 1.16) : 1
    return d.remaining / r
  }

  const total = showBs ? overview?.netWorth.totalVes : overview?.netWorth.totalUsd
  const baseCurrency: Currency = showBs ? 'VES' : 'USD'
  const weekExpense = overview?.week.expenseUsd ?? 0
  const prevWeekExpense = overview?.week.prevExpenseUsd ?? 0
  const weekDelta = prevWeekExpense > 0 ? ((weekExpense - prevWeekExpense) / prevWeekExpense) * 100 : null

  // cuenta fija de Binance (USDT) — puede no existir aún en datos cacheados
  const binanceAcc =
    overview?.accounts.find((a) => a.type === 'BINANCE') ??
    overview?.accounts.find((a) => a.currency === 'USDT')

  const doRefresh = async () => {
    setRefreshing(true)
    try {
      await api.refreshRates()
      await refreshOverview()
      toast({ title: 'Tasas actualizadas desde BCV y Binance ✓' })
    } catch (e) {
      toast({ title: 'No pude refrescar', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setRefreshing(false)
    }
  }

  if (!overview && loadingOverview) {
    return (
      <div className="pt-6 space-y-5">
        <Skeleton className="h-44 rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }

  if (!overview) {
    return (
      <EmptyState
        title="No pudimos cargar tus datos"
        hint="Verifica tu conexión y vuelve a intentar"
        action={<Button onClick={() => refreshOverview()}>Reintentar</Button>}
      />
    )
  }

  return (
    <div className="pt-5 md:pt-8 pb-4 space-y-7">
      {/* ── HERO patrimonio ── */}
      <section className="glass rounded-3xl p-6 relative overflow-hidden">
        <div
          className="absolute -top-24 -right-16 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, oklch(0.72 0.175 163 / 0.16), transparent 70%)' }}
        />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Patrimonio total
            </p>
            <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
              <h1 className="tnum text-4xl md:text-5xl font-bold tracking-tight text-glow">
                {formatMoney(total ?? 0, baseCurrency, false)}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => setShowBsOverride(!showBs)}
                className="rounded-lg bg-secondary/70 px-2.5 py-1 text-xs font-semibold text-foreground/80 hover:bg-secondary transition-colors"
              >
                Ver en {showBs ? 'dólares' : 'bolívares'}
              </button>
              <span className="text-xs text-muted-foreground">
                ≈ {formatMoney(overview.netWorth.totalUsd, 'USD', false)} · Bs{' '}
                {formatMoney(overview.netWorth.totalVes, 'VES', false)}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={doRefresh}
            disabled={refreshing}
            className="rounded-xl glass hover:bg-secondary"
            aria-label="Actualizar tasas"
          >
            <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
          </Button>
        </div>

        {/* monedas que componen el patrimonio */}
        <div className="flex flex-wrap gap-2 mt-4">
          {Object.entries(overview.netWorth.byCurrency)
            .filter(([cur, v]) => Math.abs(v) > 0.005 && cur !== 'USDT')
            .map(([cur, val]) => (
              <span
                key={cur}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2.5 py-1 text-xs"
              >
                <CurrencyBadge currency={cur} />
                <span className="tnum text-foreground/85">{formatMoney(val, cur as Currency, false)}</span>
              </span>
            ))}
        </div>

        {/* patrimonio separado: cuentas (Bs) + Binance USDT fija */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-2xl bg-secondary/50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Cuentas (bancos y efectivo)</p>
            <p className="tnum text-lg font-bold mt-1">
              {formatMoney(overview.netWorth.accountsVes ?? 0, 'VES', false)}
            </p>
            <p className="text-[10px] text-muted-foreground tnum">
              ≈ {formatMoney(overview.netWorth.accountsUsd ?? 0, 'USD', false)}
            </p>
          </div>
          <button
            onClick={() =>
              binanceAcc &&
              openTxDialog({ prefill: { type: 'TRANSFER', toAccountId: binanceAcc.id } })
            }
            className="rounded-2xl border border-[#f0b90b]/30 bg-[#f0b90b]/10 px-4 py-3 text-left hover:border-[#f0b90b]/50 transition-colors active:scale-[0.98]"
            aria-label="Ver cuenta Binance o enviar dinero a Binance"
          >
            <p className="text-[10px] uppercase tracking-widest text-[#f0b90b]">🟡 Binance · USDT</p>
            <p className="tnum text-lg font-bold mt-1 text-[#f0b90b]">
              {formatMoney(overview.netWorth.binanceUsdt ?? 0, 'USDT', false)}
            </p>
            <p className="text-[10px] text-muted-foreground tnum">
              ≈ {formatMoney(overview.netWorth.binanceUsd ?? 0, 'USD', false)} · toca para enviar
            </p>
          </button>
        </div>
      </section>

      {/* ── tasas ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RateCard label="BCV" value={rates?.bcv ?? null} color="#f5b544" delta={delta('bcv')} onClick={() => setView('rates')} />
        <RateCard label="Paralelo" value={rates?.paralelo ?? null} color="#38e07f" delta={delta('paralelo')} onClick={() => setView('rates')} />
        <RateCard label="USDT P2P" value={rates?.usdt ?? null} color="#2dd4bf" delta={delta('usdt')} onClick={() => setView('rates')} />
        <RateCard label="Euro BCV" value={rates?.eurBcv ?? null} color="#c084fc" delta={delta('eurBcv')} onClick={() => setView('rates')} unit="por 1 €" />
      </section>

      {/* ── acciones rápidas ── */}
      <section className="grid grid-cols-4 gap-2.5">
        {[
          {
            label: 'Gasto',
            icon: <ArrowUpRight size={19} className="text-rose-400" />,
            action: () => {
              const acc = overview.accounts.find((a) => a.currency === 'VES') ?? overview.accounts[0]
              openTxDialog({ prefill: { type: 'EXPENSE', accountId: acc?.id } })
            },
          },
          {
            label: 'Ingreso',
            icon: <TrendingUp size={19} className="text-emerald-400" />,
            action: () => openTxDialog({ prefill: { type: 'INCOME' } }),
          },
          {
            label: 'Escanear',
            icon: <Camera size={19} className="text-amber-400" />,
            action: () => setView('scanner'),
          },
          {
            label: 'Cambio',
            icon: <ArrowLeftRight size={19} className="text-violet-300" />,
            action: () => setView('rates'),
          },
        ].map((a) => (
          <button
            key={a.label}
            onClick={a.action}
            className="glass rounded-2xl py-3.5 flex flex-col items-center gap-1.5 active:scale-95 transition-transform hover:border-white/15"
          >
            {a.icon}
            <span className="text-[11px] font-medium text-foreground/80">{a.label}</span>
          </button>
        ))}
      </section>

      {/* ── cuentas ── */}
      <section>
        <SectionTitle
          title="Mis cuentas"
          action={
            <Button variant="ghost" size="sm" className="h-7 text-emerald-400" onClick={() => setView('accounts')}>
              Ver todas <ChevronRight size={14} />
            </Button>
          }
        />
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          {overview.accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => openTxDialog({ prefill: { type: 'EXPENSE', accountId: a.id } })}
              className="glass rounded-2xl p-4 min-w-40 text-left shrink-0 active:scale-[0.98] transition-transform hover:border-white/15"
            >
              <div className="flex items-center justify-between">
                <CatIcon icon={a.icon} color={a.color} size={15} />
                <CurrencyBadge currency={a.currency} />
              </div>
              <p className="text-[13px] font-medium mt-2.5 truncate max-w-36">{a.name}</p>
              <p className="tnum text-lg font-bold mt-0.5">{formatMoney(a.balance, a.currency)}</p>
              <p className="text-[11px] text-muted-foreground tnum">
                {a.currency === 'USD' ? '' : `≈ ${formatMoney(a.balanceUsd, 'USD')}`}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* ── flujo 14 días ── */}
      <section className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm">Flujo de los últimos 14 días</h3>
            <p className="text-[11px] text-muted-foreground">En dólares (tasa al momento de cada gasto)</p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> Gasto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Ingreso
            </span>
          </div>
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fill: '#8b8fa3', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
                      <p className="font-semibold mb-1">{label}</p>
                      {payload.map((p) => (
                        <p key={p.name} className="tnum flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: p.name === 'gasto' ? '#fb7185' : '#38e07f' }}
                          />
                          {p.name === 'gasto' ? 'Gasto' : 'Ingreso'}: ${Number(p.value).toFixed(2)}
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="gasto" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar dataKey="ingreso" fill="#38e07f" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingDown size={12} className="text-rose-400" /> Gasto esta semana
            </p>
            <p className="tnum font-bold text-lg">${weekExpense.toFixed(2)}</p>
            {weekDelta != null && (
              <p className={cn('text-[11px] tnum', weekDelta > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                {weekDelta > 0 ? '▲' : '▼'} {Math.abs(weekDelta).toFixed(0)}% vs semana anterior
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp size={12} className="text-emerald-400" /> Ingreso esta semana
            </p>
            <p className="tnum font-bold text-lg">${(overview.week.incomeUsd ?? 0).toFixed(2)}</p>
            <p className="text-[11px] text-muted-foreground tnum">
              Hormiga (30d): ${overview.hormiga30.totalUsd.toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      {/* ── presupuestos ── */}
      {overview.budgets.length > 0 && (
        <section>
          <SectionTitle
            title="Presupuestos"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-emerald-400" onClick={() => setView('budgets')}>
                Ver todos <ChevronRight size={14} />
              </Button>
            }
          />
          <div className="space-y-3">
            {overview.budgets.slice(0, 2).map((b) => (
              <button
                key={b.id}
                onClick={() => setView('budgets')}
                className="glass rounded-2xl p-4 w-full text-left hover:border-white/15 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CatIcon icon={b.categoryIcon} color={b.categoryColor} size={14} />
                    <span className="text-sm font-medium truncate">{b.name}</span>
                    <CurrencyBadge currency={b.currency} />
                  </div>
                  <span className={cn('tnum text-sm font-semibold', b.pct >= 100 ? 'text-rose-400' : 'text-foreground/85')}>
                    ${b.spent.toFixed(0)} / ${b.limitAmount.toFixed(0)}
                  </span>
                </div>
                <BudgetBar pct={b.pct} />
                <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                  <span>{b.windowLabel}</span>
                  <span className={cn(b.pct >= 100 && 'text-rose-400 font-semibold')}>
                    {b.pct >= 100 ? `Excedido (${b.pct.toFixed(0)}%)` : `${b.pct.toFixed(0)}% usado`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── deudas + metas ── */}
      <section className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={() => setView('debts')}
          className="glass rounded-2xl p-4 text-left hover:border-white/15 transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-8 h-8 rounded-xl bg-rose-400/12 text-rose-400 flex items-center justify-center">
              <ArrowUpRight size={16} />
            </span>
            <p className="text-sm font-semibold">Por pagar</p>
            {porPagar.some((d) => d.overdue) && (
              <span className="ml-auto text-[10px] font-bold text-rose-400 bg-rose-400/10 rounded-md px-1.5 py-0.5">
                VENCIDA
              </span>
            )}
          </div>
          <p className="tnum text-xl font-bold">
            ${porPagar.reduce((s, d) => s + debtUsd(d), 0).toFixed(0)}
          </p>
          <p className="text-[11px] text-muted-foreground">{porPagar.length} deuda(s) pendiente(s)</p>
        </button>
        <button
          onClick={() => setView('debts')}
          className="glass rounded-2xl p-4 text-left hover:border-white/15 transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-8 h-8 rounded-xl bg-emerald-400/12 text-emerald-400 flex items-center justify-center">
              <TrendingUp size={16} />
            </span>
            <p className="text-sm font-semibold">Por cobrar</p>
          </div>
          <p className="tnum text-xl font-bold">
            ${porCobrar.reduce((s, d) => s + debtUsd(d), 0).toFixed(0)}
          </p>
          <p className="text-[11px] text-muted-foreground">{porCobrar.length} cobro(s) pendiente(s)</p>
        </button>
      </section>

      {overview.goals.length > 0 && (
        <section>
          <SectionTitle
            title="Metas de ahorro"
            action={
              <Button variant="ghost" size="sm" className="h-7 text-emerald-400" onClick={() => setView('goals')}>
                Ver todas <ChevronRight size={14} />
              </Button>
            }
          />
          <div className="grid sm:grid-cols-2 gap-3">
            {overview.goals.slice(0, 2).map((g) => (
              <button
                key={g.id}
                onClick={() => setView('goals')}
                className="glass rounded-2xl p-4 text-left hover:border-white/15 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <CatIcon icon={g.icon} color={g.color} size={14} />
                    <span className="text-sm font-medium truncate">{g.name}</span>
                  </div>
                  <span className="tnum text-sm font-semibold text-emerald-300">{g.pct.toFixed(0)}%</span>
                </div>
                <BudgetBar pct={g.pct} />
                <p className="text-[11px] text-muted-foreground tnum mt-1.5">
                  ${g.saved.toFixed(0)} de ${g.targetAmount.toFixed(0)} {g.currency}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── gastos por categoría ── */}
      {donutData.length > 0 && (
        <section className="glass rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-4">Gastos por categoría (30 días)</h3>
          <div className="flex items-center gap-5">
            <div className="w-36 h-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
                          <p className="font-semibold">{payload[0].name}</p>
                          <p className="tnum">${Number(payload[0].value).toFixed(2)}</p>
                        </div>
                      ) : null
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {donutData.slice(0, 5).map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="truncate flex-1 text-foreground/80">{d.name}</span>
                  <span className="tnum text-muted-foreground">${d.value.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── recientes ── */}
      <section>
        <SectionTitle
          title="Movimientos recientes"
          action={
            <Button variant="ghost" size="sm" className="h-7 text-emerald-400" onClick={() => setView('transactions')}>
              Ver todos <ChevronRight size={14} />
            </Button>
          }
        />
        <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
          {overview.recent.map((t) => (
            <button
              key={t.id}
              onClick={() => useAppStore.getState().openTxDialog({ edit: t })}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-white/[0.03] transition-colors"
            >
              <CatIcon icon={t.categoryIcon ?? t.accountIcon} color={t.categoryColor ?? t.accountColor} size={17} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{t.description ?? t.categoryName ?? 'Movimiento'}</p>
                  <SourceBadge source={t.source} />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {dayLabel(t.date)} · {t.type === 'TRANSFER' ? `${t.accountName} → ${t.toAccountName}` : t.accountName}
                  {t.reference ? ` · Ref ${t.reference}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <Money
                  amount={t.type === 'TRANSFER' ? t.amount : t.type === 'EXPENSE' ? -t.amount : t.amount}
                  currency={t.currency}
                  className={cn(
                    'text-sm font-semibold tnum',
                    t.type === 'INCOME' && 'text-emerald-400',
                    t.type === 'EXPENSE' && 'text-foreground/90'
                  )}
                />
                {t.originalAmount != null && t.originalCurrency && (
                  <p className="tnum text-[10px] text-muted-foreground">
                    ≡ {formatMoney(t.originalAmount, t.originalCurrency as never)}
                  </p>
                )}
                <div className="flex justify-end mt-0.5">
                  <TxTypeIcon type={t.type} className="opacity-60" />
                </div>
              </div>
            </button>
          ))}
          {overview.recent.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={<Wallet size={24} />}
                title="Aún no tienes movimientos"
                hint='Prueba el asistente: "gasté 4.500 Bs en almuerzo"'
              />
            </div>
          )}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground text-center">
        Tasas: {formatRate(rates?.bcv)} BCV · {formatRate(rates?.paralelo)} paralelo ·{' '}
        {formatRate(rates?.usdt)} USDT
      </p>
    </div>
  )
}
