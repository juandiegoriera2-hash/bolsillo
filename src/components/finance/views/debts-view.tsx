'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { CurrencyBadge, EmptyState, ViewHeader } from '../parts'
import { daysUntil, fullDate, shortDate } from '../fmt'
import { formatMoney, CURRENCIES, CURRENCY_META, type Currency } from '@/lib/finance'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import { ArrowUpRight, ChevronDown, HandCoins, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react'
import type { DebtDTO } from '../types'

export function DebtsView() {
  const { overview } = useAppStore()
  const { toast } = useToast()
  const [debts, setDebts] = useState<DebtDTO[] | null>(null)
  const [tab, setTab] = useState<'POR_PAGAR' | 'POR_COBRAR'>('POR_PAGAR')
  const [dialog, setDialog] = useState<{ open: boolean; edit: DebtDTO | null }>({ open: false, edit: null })
  const [payDialog, setPayDialog] = useState<DebtDTO | null>(null)

  const rates = overview?.rates
  const load = async () => setDebts(await api.debts())
  useEffect(() => {
    api.debts().then(setDebts).catch(() => setDebts([]))
  }, [])

  const toUsd = (amount: number, currency: string) => {
    if (currency === 'VES') return amount / (rates?.paralelo ?? 1)
    if (currency === 'EUR') return amount * (rates?.eurUsd ?? 1.16)
    return amount
  }

  const list = (debts ?? []).filter((d) => d.kind === tab)
  const totalUsd = list.filter((d) => d.remaining > 0.005).reduce((s, d) => s + toUsd(d.remaining, d.currency), 0)

  const remove = async (d: DebtDTO) => {
    if (!confirm(`¿Eliminar la deuda de ${d.person}?`)) return
    try {
      await api.deleteDebt(d.id)
      toast({ title: 'Deuda eliminada' })
      load()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="pb-4">
      <ViewHeader title="Deudas" subtitle="Por pagar y por cobrar · seguimiento de abonos parciales" />

      {/* tabs */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary/60 p-1 mb-4">
        {(
          [
            { id: 'POR_PAGAR', label: 'Por pagar', icon: <ArrowUpRight size={14} /> },
            { id: 'POR_COBRAR', label: 'Por cobrar', icon: <TrendingUp size={14} /> },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all',
              tab === t.id ? 'bg-background shadow' : 'text-muted-foreground'
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] text-muted-foreground">
            {tab === 'POR_PAGAR' ? 'Total que debes' : 'Total que te deben'}
          </p>
          <p className="tnum text-2xl font-bold">${totalUsd.toFixed(2)}</p>
        </div>
        <Button
          onClick={() => setDialog({ open: true, edit: null })}
          className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold"
        >
          <Plus size={15} className="mr-1" />
          {tab === 'POR_PAGAR' ? 'Debo a alguien' : 'Me deben'}
        </Button>
      </div>

      {!debts ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<HandCoins size={24} />}
          title={tab === 'POR_PAGAR' ? 'No debes nada 🎉' : 'Nadie te debe nada 🎉'}
          hint="Registra préstamos con abonos parciales para llevar el control."
        />
      ) : (
        <div className="space-y-3">
          {list.map((d) => {
            const pct = d.amount > 0 ? (d.paid / d.amount) * 100 : 0
            const settled = d.remaining <= 0.005
            return (
              <div key={d.id} className="glass rounded-2xl p-4 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{d.person}</p>
                      {d.overdue && (
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-400/10 rounded-md px-1.5 py-0.5">
                          VENCIDA
                        </span>
                      )}
                      {settled && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 rounded-md px-1.5 py-0.5">
                          SALDADA
                        </span>
                      )}
                    </div>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ open: true, edit: d })}>
                      <Pencil size={13} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400" onClick={() => remove(d)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                <div className="flex items-end justify-between mt-3">
                  <div>
                    <p className="tnum text-xl font-bold">{formatMoney(d.remaining, d.currency as Currency)}</p>
                    <p className="text-[11px] text-muted-foreground tnum">
                      de {formatMoney(d.amount, d.currency as Currency)} · pagado {formatMoney(d.paid, d.currency as Currency)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <CurrencyBadge currency={d.currency} />
                    <span className="text-[11px] text-muted-foreground">≈ ${toUsd(d.remaining, d.currency).toFixed(2)}</span>
                  </div>
                </div>

                {/* progreso de abonos */}
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden mt-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: settled ? '#38e07f' : '#2dd4bf' }}
                  />
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="text-[11px] text-muted-foreground">
                    {d.dueDate && (
                      <span className={cn(d.overdue && 'text-rose-400 font-medium')}>
                        {d.overdue ? `Venció hace ${Math.abs(daysUntil(d.dueDate))}d` : `Vence en ${daysUntil(d.dueDate)}d`} · {fullDate(d.dueDate)}
                      </span>
                    )}
                  </div>
                  {!settled && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
                      onClick={() => setPayDialog(d)}
                    >
                      <HandCoins size={13} className="mr-1" /> Abonar
                    </Button>
                  )}
                </div>

                {d.payments.length > 0 && <PaymentsList debt={d} onChanged={load} />}
              </div>
            )
          })}
        </div>
      )}

      <DebtDialog
        open={dialog.open}
        edit={dialog.edit}
        defaultKind={tab}
        onClose={() => setDialog({ open: false, edit: null })}
        onSaved={load}
      />
      <PaymentDialog debt={payDialog} onClose={() => setPayDialog(null)} onSaved={load} />
    </div>
  )
}

function PaymentsList({ debt, onChanged }: { debt: DebtDTO; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const { toast } = useToast()
  const del = async (paymentId: string) => {
    try {
      await api.deleteDebtPayment(debt.id, paymentId)
      onChanged()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }
  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
        {debt.payments.length} abono(s)
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {debt.payments.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              <span className="tnum font-medium">{formatMoney(p.amount, debt.currency as Currency)}</span>
              <span className="text-muted-foreground">{shortDate(p.date)}{p.note ? ` · ${p.note}` : ''}</span>
              <button onClick={() => del(p.id)} className="ml-auto text-rose-400/70 hover:text-rose-400">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DebtDialog({
  open,
  edit,
  defaultKind,
  onClose,
  onSaved,
}: {
  open: boolean
  edit: DebtDTO | null
  defaultKind: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [kind, setKind] = useState('POR_PAGAR')
  const [person, setPerson] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  const openKey = `${open}-${edit?.id ?? 'new'}-${defaultKind}`
  if (open && key !== openKey) {
    setKey(openKey)
    setKind(edit?.kind ?? defaultKind)
    setPerson(edit?.person ?? '')
    setDescription(edit?.description ?? '')
    setAmount(edit ? String(edit.amount) : '')
    setCurrency((edit?.currency ?? 'USD') as Currency)
    setDueDate(edit?.dueDate ? edit.dueDate.slice(0, 10) : '')
  }

  const submit = async () => {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!person.trim() || !Number.isFinite(amt) || amt <= 0 || saving) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        kind,
        person: person.trim(),
        description: description.trim() || null,
        amount: amt,
        currency,
        dueDate: dueDate ? `${dueDate}T12:00:00` : null,
      }
      if (edit) await api.updateDebt(edit.id, payload)
      else await api.createDebt(payload)
      toast({ title: edit ? 'Deuda actualizada ✓' : 'Deuda registrada ✓' })
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
      <DialogContent className="glass border-white/10 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? 'Editar deuda' : kind === 'POR_PAGAR' ? 'Registrar deuda (yo debo)' : 'Registrar cobro (me deben)'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'POR_PAGAR', label: 'Yo debo' },
                { id: 'POR_COBRAR', label: 'Me deben' },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  'rounded-xl border py-2.5 text-sm font-semibold transition-all',
                  kind === k.id
                    ? k.id === 'POR_PAGAR'
                      ? 'border-rose-400/50 bg-rose-400/10 text-rose-300'
                      : 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                    : 'border-white/10 bg-secondary/40 text-muted-foreground'
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Persona / entidad</Label>
              <Input placeholder="Ej: María, Banesco…" value={person} onChange={(e) => setPerson(e.target.value)} className="bg-secondary/40 border-white/10" />
            </div>
            <div>
              <Label>Concepto (opcional)</Label>
              <Input placeholder="Préstamo, cuota…" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-secondary/40 border-white/10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto</Label>
              <Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-secondary/40 border-white/10 tnum h-10 text-lg font-bold" />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_META[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Fecha límite (opcional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-secondary/40 border-white/10" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!person.trim() || saving} className="font-semibold">
            {saving ? 'Guardando…' : edit ? 'Guardar' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaymentDialog({ debt, onClose, onSaved }: { debt: DebtDTO | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  const openKey = `${!!debt}-${debt?.id}`
  if (debt && key !== openKey) {
    setKey(openKey)
    setAmount(String(debt.remaining.toFixed(2)))
    setNote('')
  }

  const submit = async () => {
    if (!debt) return
    const amt = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0 || saving) return
    setSaving(true)
    try {
      await api.addDebtPayment(debt.id, { amount: amt, note: note.trim() || undefined })
      toast({
        title: 'Abono registrado ✓',
        description: amt >= debt.remaining ? '¡Deuda saldada por completo!' : `Restan ${formatMoney(debt.remaining - amt, debt.currency as Currency)}`,
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
    <Dialog open={!!debt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass border-white/10 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins size={17} className="text-teal-300" /> Abonar a {debt?.person}
          </DialogTitle>
        </DialogHeader>
        {debt && (
          <div className="space-y-4">
            <Badge variant="outline" className="border-white/10 text-muted-foreground tnum">
              Restan {formatMoney(debt.remaining, debt.currency as Currency)}
            </Badge>
            <div>
              <Label>Monto del abono</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-secondary/40 border-white/10 tnum h-12 text-xl font-bold"
              />
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Input placeholder="Ej: abono parcial" value={note} onChange={(e) => setNote(e.target.value)} className="bg-secondary/40 border-white/10" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="font-semibold bg-teal-400 text-teal-950 hover:bg-teal-300">
            {saving ? 'Guardando…' : 'Registrar abono'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
