'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { BudgetBar, CatIcon, CurrencyBadge, EmptyState, ViewHeader } from '../parts'
import { caracasDateKey, formatCompact, formatMoney, parseAmount, vesRate } from '@/lib/finance'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarDays, ChartPie, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BudgetMonthDTO, BudgetMonthView } from '../types'

const CYCLES = [
  { id: 'WEEKLY', label: 'Semanal', desc: 'reinicia cada lunes' },
  { id: 'BIWEEKLY', label: 'Quincenal', desc: 'ciclos de 15 días' },
  { id: 'MONTHLY', label: 'Mensual', desc: 'cada 1ro del mes' },
  { id: 'CUSTOM', label: 'Personalizado', desc: 'define tus días (mesadas)' },
]

const CYCLE_SHORT: Record<string, string> = {
  WEEKLY: 'semana',
  BIWEEKLY: 'quincena',
  MONTHLY: 'mes',
  CUSTOM: 'ciclo',
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** clave del mes actual en horario de Venezuela ("YYYY-MM") */
function currentMonthKey(): string {
  return caracasDateKey().slice(0, 7)
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BudgetsView() {
  const { categories, tags, overview } = useAppStore()
  const { toast } = useToast()
  const [month, setMonth] = useState(currentMonthKey())
  const [data, setData] = useState<BudgetMonthView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; edit: BudgetMonthDTO | null }>({ open: false, edit: null })

  useEffect(() => {
    let alive = true
    api
      .budgets(month)
      .then((d) => {
        if (alive) {
          setData(d)
          setError(null)
        }
      })
      .catch((e) => {
        if (alive) setError((e as Error).message)
      })
    return () => {
      alive = false
    }
  }, [month])

  const reload = () => {
    api
      .budgets(month)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch(() => {})
  }

  const remove = async (b: BudgetMonthDTO) => {
    if (!confirm(`¿Eliminar el presupuesto "${b.name}"?`)) return
    try {
      await api.deleteBudget(b.id)
      toast({ title: 'Presupuesto eliminado' })
      reload()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  // conversión a la moneda principal del usuario (para el calendario)
  const baseCur = overview?.settings.baseCurrency === 'USD' ? 'USD' : 'VES'
  const valRate = overview ? vesRate(overview.rates, overview.settings.valuationSource) : 1
  const toBase = (usd: number) => (baseCur === 'USD' ? usd : usd * valRate)
  const fmtBase = (usd: number) => formatMoney(toBase(usd), baseCur)
  const fmtBaseCompact = (usd: number) => formatCompact(toBase(usd))

  const isCurrent = month === currentMonthKey()
  const loading = !data || data.month !== month
  const todayDay = Number(caracasDateKey().slice(8))

  // días restantes del mes (para presupuestos mensuales del mes en curso)
  let daysLeftMonth: number | null = null
  if (data?.isCurrent) {
    const [y, mo] = data.month.split('-').map(Number)
    const daysInMonth = new Date(y, mo, 0).getDate()
    daysLeftMonth = Math.max(0, daysInMonth - todayDay + 1)
  }

  return (
    <div className="pb-4">
      <ViewHeader
        title="Presupuestos"
        subtitle="Control por mes con vista calendario · límites indexados en $"
      />

      {/* navegador de mes + nuevo */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-white/10 bg-secondary/40"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} />
          </Button>
          <div className="glass rounded-xl px-4 py-1.5 text-sm font-bold min-w-[130px] text-center">
            {loading ? (
              <Skeleton className="h-4 w-24 mx-auto" />
            ) : (
              data?.monthLabel ?? month
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-white/10 bg-secondary/40"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={isCurrent}
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} />
          </Button>
          {!isCurrent && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-emerald-400 hover:text-emerald-300 font-semibold"
              onClick={() => setMonth(currentMonthKey())}
            >
              Hoy
            </Button>
          )}
        </div>
        <Button
          onClick={() => setDialog({ open: true, edit: null })}
          className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold"
        >
          <Plus size={15} className="mr-1" /> Nuevo presupuesto
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : !data ? (
        <EmptyState
          icon={<ChartPie size={24} />}
          title="No pude cargar los presupuestos"
          hint={error ?? 'Revisa tu conexión e inténtalo de nuevo.'}
          action={
            <Button variant="outline" className="border-white/10 bg-secondary/40" onClick={reload}>
              Reintentar
            </Button>
          }
        />
      ) : (
        <>
          {/* calendario del mes */}
          <MonthCalendar data={data} fmtBase={fmtBase} fmtBaseCompact={fmtBaseCompact} todayDay={todayDay} />

          {/* resumen del mes */}
          <div className="flex flex-wrap gap-3 mb-5">
            {data.totals.map((t) => {
              const cur = t.currency as 'USD' | 'VES'
              const pct = t.allocated > 0 ? (t.spent / t.allocated) * 100 : 0
              return (
                <div key={t.currency} className="glass rounded-2xl p-4 flex-1 min-w-[150px]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Presupuestado {cur === 'USD' ? '($)' : '(Bs)'}
                  </p>
                  <p className="tnum font-bold">
                    {formatMoney(t.spent, cur)}
                    <span className="text-muted-foreground text-sm font-medium"> / {formatMoney(t.allocated, cur)}</span>
                  </p>
                  <BudgetBar pct={pct} className="mt-2" />
                  <p className="text-[11px] mt-1.5 text-muted-foreground">
                    {t.remaining >= 0
                      ? <>Libre <span className="text-foreground/80 font-semibold">{formatMoney(t.remaining, cur)}</span></>
                      : <>Excedido <span className="text-rose-400 font-semibold">{formatMoney(Math.abs(t.remaining), cur)}</span></>}
                  </p>
                </div>
              )
            })}
            <div className="glass rounded-2xl p-4 flex-1 min-w-[150px]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Gasto total del mes
              </p>
              <p className="tnum font-bold">{fmtBase(data.monthExpenseUsd)}</p>
              <p className="text-[11px] mt-1.5 text-muted-foreground">todos tus gastos, con o sin presupuesto</p>
            </div>
          </div>

          {/* presupuestos del mes */}
          {data.budgets.length === 0 ? (
            <EmptyState
              icon={<ChartPie size={24} />}
              title="Sin presupuestos"
              hint="Crea límites por categoría, etiqueta o gasto total. Los montos en USD se mantienen estables ante la devaluación."
            />
          ) : (
            <div className="space-y-3">
              {data.budgets.map((b) => {
                const cur = b.currency as 'USD' | 'VES'
                const approx = b.cycle !== 'MONTHLY'
                return (
                  <div key={b.id} className="glass rounded-2xl p-4 group">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {b.categoryIcon ? (
                          <CatIcon icon={b.categoryIcon} color={b.categoryColor} size={15} />
                        ) : b.tagName ? (
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: `${b.tagColor}22`, color: b.tagColor }}
                          >
                            🐜
                          </span>
                        ) : (
                          <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                            ∑
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{b.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {b.categoryName ? b.categoryName : b.tagName ? `Etiqueta: ${b.tagName}` : 'Todos los gastos'} ·{' '}
                            {CYCLES.find((c) => c.id === b.cycle)?.label}
                            {b.cycle === 'CUSTOM' && b.customDays ? ` (${b.customDays}d)` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ open: true, edit: b })}>
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => remove(b)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-end justify-between mb-2">
                      <p className="tnum text-lg font-bold">
                        {formatMoney(b.monthSpend, cur)}
                        <span className="text-muted-foreground text-sm font-medium">
                          {' '}/ {approx ? '≈ ' : ''}
                          {formatMoney(b.monthAllocation, cur)}
                        </span>
                      </p>
                      <div className="flex items-center gap-1.5">
                        <CurrencyBadge currency={b.currency} />
                        <span
                          className={cn(
                            'tnum text-sm font-bold',
                            b.monthPct >= 100 ? 'text-rose-400' : b.monthPct >= 85 ? 'text-amber-400' : 'text-emerald-400'
                          )}
                        >
                          {b.monthPct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <BudgetBar pct={b.monthPct} />
                    <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground gap-2 flex-wrap">
                      <span>
                        {b.monthPct >= 100
                          ? `Excedido por ${formatMoney(b.monthSpend - b.monthAllocation, cur)}`
                          : `Disponible ${formatMoney(b.monthRemaining, cur)}`}
                      </span>
                      <span>
                        {data.isCurrent
                          ? b.cycle === 'MONTHLY'
                            ? daysLeftMonth != null
                              ? `${daysLeftMonth}d restantes en el mes`
                              : ''
                            : b.cycleSpent != null
                              ? `${CYCLE_SHORT[b.cycle]} actual: ${formatMoney(b.cycleSpent, cur)} de ${formatMoney(
                                  b.limitAmount,
                                  cur
                                )}${b.cycleDaysLeft != null ? ` · ${b.cycleDaysLeft}d` : ''}`
                              : ''
                          : 'mes cerrado'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <BudgetDialog
        open={dialog.open}
        edit={dialog.edit}
        categories={categories}
        tags={tags}
        onClose={() => setDialog({ open: false, edit: null })}
        onSaved={reload}
      />
    </div>
  )
}

// ── Calendario del mes ────────────────────────────────────────────

function MonthCalendar({
  data,
  fmtBase,
  fmtBaseCompact,
  todayDay,
}: {
  data: BudgetMonthView
  fmtBase: (usd: number) => string
  fmtBaseCompact: (usd: number) => string
  todayDay: number
}) {
  const [y, mo] = data.month.split('-').map(Number)
  const first = new Date(y, mo - 1, 1)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // lunes = 0
  const byDay = new Map(data.calendar.map((c) => [Number(c.dateKey.slice(8)), c]))
  const maxSpend = Math.max(...data.calendar.map((c) => c.expenseUsd), 0.001)
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <section className="glass rounded-2xl p-4 md:p-5 mb-4" aria-label={`Calendario de gastos de ${data.monthLabel}`}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CalendarDays size={15} className="text-emerald-400" /> Gasto diario · {data.monthLabel}
        </h3>
        <p className="text-xs text-muted-foreground tnum">
          Total: <span className="font-bold text-foreground/90">{fmtBase(data.monthExpenseUsd)}</span>
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={`blank-${i}`} className="min-h-11 md:min-h-13 rounded-lg" />
          const c = byDay.get(day)
          const spend = c?.expenseUsd ?? 0
          const intensity = spend > 0 ? 0.08 + 0.3 * Math.min(1, spend / maxSpend) : 0
          const isToday = data.isCurrent && day === todayDay
          const isFuture = data.isCurrent && day > todayDay
          return (
            <div
              key={day}
              className={cn(
                'min-h-11 md:min-h-13 rounded-lg p-1 flex flex-col justify-between',
                isToday && 'ring-1 ring-emerald-400/60',
                !isToday && spend <= 0 && 'bg-secondary/30'
              )}
              style={spend > 0 ? { backgroundColor: `rgba(244, 63, 94, ${intensity.toFixed(2)})` } : undefined}
              title={c ? `${c.txCount} movimientos · ${fmtBase(spend)}` : undefined}
            >
              <span className={cn('text-[10px] font-semibold tnum', isFuture ? 'text-muted-foreground/50' : 'text-foreground/70')}>
                {day}
              </span>
              {spend > 0 && (
                <span className="text-[10px] md:text-[11px] font-bold tnum text-rose-200/90 leading-none truncate">
                  {fmtBaseCompact(spend)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Diálogo crear/editar ──────────────────────────────────────────

function BudgetDialog({
  open,
  edit,
  categories,
  tags,
  onClose,
  onSaved,
}: {
  open: boolean
  edit: BudgetMonthDTO | null
  categories: { id: string; name: string; kind: string }[]
  tags: { id: string; name: string; color: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('none')
  const [tagId, setTagId] = useState('none')
  const [limitAmount, setLimitAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [cycle, setCycle] = useState('MONTHLY')
  const [customDays, setCustomDays] = useState('30')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  const openKey = `${open}-${edit?.id ?? 'new'}`
  if (open && key !== openKey) {
    setKey(openKey)
    setName(edit?.name ?? '')
    setCategoryId(edit?.categoryId ?? 'none')
    setTagId(edit?.tagId ?? 'none')
    setLimitAmount(edit ? String(edit.limitAmount) : '')
    setCurrency(edit?.currency ?? 'USD')
    setCycle(edit?.cycle ?? 'MONTHLY')
    setCustomDays(String(edit?.customDays ?? 30))
  }

  const submit = async () => {
    const amount = parseAmount(limitAmount)
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0 || saving) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        categoryId: categoryId === 'none' ? null : categoryId,
        tagId: tagId === 'none' ? null : tagId,
        limitAmount: amount,
        currency,
        cycle,
        customDays: cycle === 'CUSTOM' ? Number(customDays) || 30 : null,
      }
      if (edit) await api.updateBudget(edit.id, payload)
      else await api.createBudget(payload)
      toast({ title: edit ? 'Presupuesto actualizado ✓' : 'Presupuesto creado ✓' })
      onClose()
      onSaved()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass border-white/10 sm:max-w-md max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? 'Editar presupuesto' : 'Nuevo presupuesto'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              placeholder="Ej: Mercado del mes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-secondary/40 border-white/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Límite</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={limitAmount}
                onChange={(e) => setLimitAmount(e.target.value)}
                className="bg-secondary/40 border-white/10 tnum h-10 text-lg font-bold"
              />
            </div>
            <div>
              <Label>Moneda del límite</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">$ indexado (recomendado)</SelectItem>
                  <SelectItem value="VES">Bs (bolívares)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Aplica a</Label>
            <div className="grid grid-cols-2 gap-3">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="none">Todas las categorías</SelectItem>
                  {categories
                    .filter((c) => c.kind === 'EXPENSE')
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={tagId} onValueChange={setTagId}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue placeholder="Etiqueta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Cualquier etiqueta</SelectItem>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Combina categoría + etiqueta para presupuestos quirúrgicos (ej: 🐜 gasto hormiga).
            </p>
          </div>
          <div>
            <Label>Ciclo</Label>
            <div className="grid grid-cols-2 gap-2">
              {CYCLES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCycle(c.id)}
                  className={cn(
                    'rounded-xl border p-2.5 text-left transition-all',
                    cycle === c.id ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-secondary/40'
                  )}
                >
                  <p className="text-xs font-semibold">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground">{c.desc}</p>
                </button>
              ))}
            </div>
            {cycle === 'CUSTOM' && (
              <div className="mt-2">
                <Label>Duración del ciclo (días)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  className="bg-secondary/40 border-white/10 w-32"
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            En la vista mensual, los ciclos semanales/quincenales se muestran como equivalente del mes (≈ límite × días del mes ÷ días del ciclo).
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!name.trim() || saving} className="font-semibold">
            {saving ? 'Guardando…' : edit ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
