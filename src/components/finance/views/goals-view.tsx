'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { CatIcon, EmptyState, ICONS, ViewHeader } from '../parts'
import { daysUntil, fullDate, shortDate } from '../fmt'
import { formatMoney } from '@/lib/finance'
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
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Pencil, PiggyBank, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import type { GoalDTO } from '../types'

const COLOR_OPTIONS = ['#38e07f', '#f5b544', '#2dd4bf', '#c084fc', '#f43f5e', '#fb923c', '#a3e635']
const ICON_OPTIONS = ['target', 'shield-check', 'palmtree', 'piggy-bank', 'laptop', 'home', 'car', 'plane']

export function GoalsView() {
  const { toast } = useToast()
  const [goals, setGoals] = useState<GoalDTO[] | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; edit: GoalDTO | null }>({ open: false, edit: null })
  const [contribute, setContribute] = useState<GoalDTO | null>(null)

  const load = async () => setGoals(await api.goals())
  useEffect(() => {
    api.goals().then(setGoals).catch(() => setGoals([]))
  }, [])

  const remove = async (g: GoalDTO) => {
    if (!confirm(`¿Eliminar la meta "${g.name}"?`)) return
    try {
      await api.deleteGoal(g.id)
      toast({ title: 'Meta eliminada' })
      load()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const totalSaved = (goals ?? []).reduce((s, g) => s + g.saved, 0)

  return (
    <div className="pb-4">
      <ViewHeader
        title="Metas de ahorro"
        subtitle="Indexadas en divisas para protegerlas de la devaluación del bolívar"
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] text-muted-foreground">Total ahorrado</p>
          <p className="tnum text-2xl font-bold text-emerald-300">${totalSaved.toFixed(2)}</p>
        </div>
        <Button onClick={() => setDialog({ open: true, edit: null })} className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold">
          <Plus size={15} className="mr-1" /> Nueva meta
        </Button>
      </div>

      {!goals ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target size={24} />}
          title="Sin metas todavía"
          hint="Crea metas en $ o € para que la devaluación no se coma tus ahorros."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {goals.map((g) => (
            <div key={g.id} className="glass rounded-2xl p-4 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CatIcon icon={g.icon} color={g.color} size={16} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{g.name}</p>
                    {g.deadline && (
                      <p className={cn('text-[11px]', g.daysLeft != null && g.daysLeft < 0 ? 'text-rose-400' : 'text-muted-foreground')}>
                        {g.daysLeft != null && g.daysLeft < 0 ? 'Plazo vencido' : `Faltan ${g.daysLeft} días`} · {fullDate(g.deadline)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ open: true, edit: g })}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => remove(g)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="tnum text-2xl font-bold">
                    {formatMoney(g.saved, g.currency as never)}
                    <span className="text-sm text-muted-foreground font-medium"> / {formatMoney(g.targetAmount, g.currency as never)}</span>
                  </p>
                </div>
                <span className={cn('tnum text-lg font-bold', g.pct >= 100 ? 'text-emerald-400' : 'text-foreground/80')}>
                  {g.pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden mt-2">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, g.pct)}%`, backgroundColor: g.color, boxShadow: `0 0 14px ${g.color}55` }}
                />
              </div>

              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] text-muted-foreground">
                  {g.pct >= 100
                    ? '¡Meta alcanzada! 🎉'
                    : g.neededPerDay != null
                      ? `Necesitas ${formatMoney(g.neededPerDay, g.currency as never)}/día`
                      : `Faltan ${formatMoney(g.targetAmount - g.saved, g.currency as never)}`}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
                  onClick={() => setContribute(g)}
                >
                  <TrendingUp size={13} className="mr-1" /> Aportar
                </Button>
              </div>

              {g.contributions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                  {g.contributions.slice(0, 3).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                      <span className="tnum font-medium">{formatMoney(c.amount, g.currency as never)}</span>
                      <span className="text-muted-foreground">
                        {shortDate(c.date)}
                        {c.note ? ` · ${c.note}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <GoalDialog
        open={dialog.open}
        edit={dialog.edit}
        onClose={() => setDialog({ open: false, edit: null })}
        onSaved={load}
      />
      <ContributeDialog goal={contribute} onClose={() => setContribute(null)} onSaved={load} />
    </div>
  )
}

function GoalDialog({
  open,
  edit,
  onClose,
  onSaved,
}: {
  open: boolean
  edit: GoalDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [color, setColor] = useState(COLOR_OPTIONS[0])
  const [icon, setIcon] = useState('target')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  const openKey = `${open}-${edit?.id ?? 'new'}`
  if (open && key !== openKey) {
    setKey(openKey)
    setName(edit?.name ?? '')
    setTargetAmount(edit ? String(edit.targetAmount) : '')
    setDeadline(edit?.deadline ? edit.deadline.slice(0, 10) : '')
    setColor(edit?.color ?? COLOR_OPTIONS[0])
    setIcon(edit?.icon ?? 'target')
  }

  const submit = async () => {
    const amt = parseFloat(targetAmount.replace(',', '.'))
    if (!name.trim() || !Number.isFinite(amt) || amt <= 0 || saving) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        targetAmount: amt,
        deadline: deadline ? `${deadline}T12:00:00` : null,
        color,
        icon,
      }
      if (edit) await api.updateGoal(edit.id, payload)
      else await api.createGoal(payload)
      toast({ title: edit ? 'Meta actualizada ✓' : 'Meta creada ✓' })
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
          <DialogTitle>{edit ? 'Editar meta' : 'Nueva meta de ahorro'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input placeholder="Ej: Fondo de emergencia" value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary/40 border-white/10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Objetivo (USD indexado)</Label>
              <Input inputMode="decimal" placeholder="1000" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className="bg-secondary/40 border-white/10 tnum h-10 text-lg font-bold" />
            </div>
            <div>
              <Label>Fecha objetivo</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-secondary/40 border-white/10" />
            </div>
          </div>
          <div>
            <Label>Icono</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((ic) => {
                const Ico = ICONS[ic] ?? Target
                return (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center border transition-all',
                      icon === ic ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/10 bg-secondary/40'
                    )}
                  >
                    <Ico size={17} />
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn('w-8 h-8 rounded-full border-2 transition-all', color === c ? 'border-white scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            💡 Las metas en dólares se mantienen estables: si el bolívar se devalúa, el monto en Bs de tu meta sube automáticamente con la tasa.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!name.trim() || saving} className="font-semibold">
            {saving ? 'Guardando…' : edit ? 'Guardar' : 'Crear meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ContributeDialog({ goal, onClose, onSaved }: { goal: GoalDTO | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  const openKey = `${!!goal}-${goal?.id}`
  if (goal && key !== openKey) {
    setKey(openKey)
    setAmount('')
    setNote('')
  }

  const submit = async () => {
    if (!goal) return
    const amt = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0 || saving) return
    setSaving(true)
    try {
      const updated = await api.contribute(goal.id, { amount: amt, note: note.trim() || undefined })
      toast({
        title: 'Aporte registrado ✓',
        description: `Llevas ${formatMoney(updated.saved, goal.currency as never)} de ${formatMoney(updated.targetAmount, goal.currency as never)}`,
      })
      onClose()
      onSaved()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass border-white/10 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank size={17} className="text-emerald-300" /> Aportar a {goal?.name}
          </DialogTitle>
        </DialogHeader>
        {goal && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground tnum">
              Ahorrado: {formatMoney(goal.saved, goal.currency as never)} · Meta: {formatMoney(goal.targetAmount, goal.currency as never)}
            </p>
            <div>
              <Label>Monto del aporte ({goal.currency})</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-secondary/40 border-white/10 tnum h-12 text-xl font-bold"
              />
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Input placeholder="Ej: bonificación" value={note} onChange={(e) => setNote(e.target.value)} className="bg-secondary/40 border-white/10" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="font-semibold">
            {saving ? 'Guardando…' : 'Aportar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
