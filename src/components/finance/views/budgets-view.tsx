'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { BudgetBar, CatIcon, CurrencyBadge, EmptyState, ViewHeader } from '../parts'
import { formatMoney, parseAmount } from '@/lib/finance'
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
import { ChartPie, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BudgetDTO } from '../types'

const CYCLES = [
  { id: 'WEEKLY', label: 'Semanal', desc: 'reinicia cada lunes' },
  { id: 'BIWEEKLY', label: 'Quincenal', desc: 'ciclos de 15 días' },
  { id: 'MONTHLY', label: 'Mensual', desc: 'cada 1ro del mes' },
  { id: 'CUSTOM', label: 'Personalizado', desc: 'define tus días (mesadas)' },
]

export function BudgetsView() {
  const { categories, tags } = useAppStore()
  const { toast } = useToast()
  const [budgets, setBudgets] = useState<BudgetDTO[] | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; edit: BudgetDTO | null }>({ open: false, edit: null })

  const load = async () => setBudgets(await api.budgets())
  useEffect(() => {
    api.budgets().then(setBudgets).catch(() => setBudgets([]))
  }, [])

  const remove = async (b: BudgetDTO) => {
    if (!confirm(`¿Eliminar el presupuesto "${b.name}"?`)) return
    try {
      await api.deleteBudget(b.id)
      toast({ title: 'Presupuesto eliminado' })
      load()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="pb-4">
      <ViewHeader
        title="Presupuestos flexibles"
        subtitle="Ciclos semanales, quincenales, mensuales o personalizados · límites indexados en $"
      />

      <div className="flex justify-end mb-3">
        <Button onClick={() => setDialog({ open: true, edit: null })} className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold">
          <Plus size={15} className="mr-1" /> Nuevo presupuesto
        </Button>
      </div>

      {!budgets ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={<ChartPie size={24} />}
          title="Sin presupuestos"
          hint="Crea límites por categoría, etiqueta o gasto total. Los montos en USD se mantienen estables ante la devaluación."
        />
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => (
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
                  {formatMoney(b.spent, b.currency as never)}
                  <span className="text-muted-foreground text-sm font-medium"> / {formatMoney(b.limitAmount, b.currency as never)}</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <CurrencyBadge currency={b.currency} />
                  <span className={cn('tnum text-sm font-bold', b.pct >= 100 ? 'text-rose-400' : b.pct >= 85 ? 'text-amber-400' : 'text-emerald-400')}>
                    {b.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <BudgetBar pct={b.pct} />
              <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                <span>
                  {b.pct >= 100
                    ? `Excedido por ${formatMoney(b.spent - b.limitAmount, b.currency as never)}`
                    : `Disponible ${formatMoney(b.remaining, b.currency as never)}`}
                </span>
                <span>
                  {b.windowLabel} · {b.daysLeft}d restantes
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <BudgetDialog
        open={dialog.open}
        edit={dialog.edit}
        categories={categories}
        tags={tags}
        onClose={() => setDialog({ open: false, edit: null })}
        onSaved={load}
      />
    </div>
  )
}

function BudgetDialog({
  open,
  edit,
  categories,
  tags,
  onClose,
  onSaved,
}: {
  open: boolean
  edit: BudgetDTO | null
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
