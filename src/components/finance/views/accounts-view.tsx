'use client'

import { useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { CatIcon, CurrencyBadge, EmptyState, ICONS, ViewHeader } from '../parts'
import { formatMoney, parseAmount, CURRENCIES, CURRENCY_META, type Currency } from '@/lib/finance'
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
import { Plus, Trash2, Wallet } from 'lucide-react'
import type { AccountDTO } from '../types'
import { cn } from '@/lib/utils'

const ACCOUNT_TYPES = [
  { id: 'BANK', label: 'Banco' },
  { id: 'CASH', label: 'Efectivo' },
  { id: 'WALLET', label: 'Billetera digital' },
  { id: 'CRYPTO', label: 'Cripto' },
]

const COLOR_OPTIONS = ['#38e07f', '#f5b544', '#2dd4bf', '#c084fc', '#f43f5e', '#fb923c', '#a3e635', '#94a3b8']
const ICON_OPTIONS = ['wallet', 'landmark', 'banknote', 'dollar-sign', 'bitcoin', 'coins', 'piggy-bank']

export function AccountsView() {
  const { overview, refreshOverview } = useAppStore()
  const { toast } = useToast()
  const [dialog, setDialog] = useState<{ open: boolean; edit: AccountDTO | null }>({ open: false, edit: null })
  const accounts = overview?.accounts ?? []

  const totalUsd = accounts.reduce((s, a) => s + a.balanceUsd, 0)

  const deleteAccount = async (a: AccountDTO) => {
    if (!confirm(`¿Eliminar "${a.name}"?`)) return
    try {
      await api.deleteAccount(a.id)
      toast({ title: 'Cuenta eliminada' })
      refreshOverview()
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="pb-4">
      <ViewHeader
        title="Cuentas y billeteras"
        subtitle={`${accounts.length} cuenta(s) · Total ≈ ${formatMoney(totalUsd, 'USD')}`}
      />

      <div className="grid sm:grid-cols-2 gap-3">
        {accounts.map((a) => (
          <div key={a.id} className="glass rounded-2xl p-4 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <CatIcon icon={a.icon} color={a.color} size={18} />
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ACCOUNT_TYPES.find((t) => t.id === a.type)?.label} · {a.txCount} mov.
                  </p>
                </div>
              </div>
              <div className="flex gap-1 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ open: true, edit: a })}>
                  <Plus size={13} className="rotate-45" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-rose-400 hover:text-rose-300"
                  onClick={() => deleteAccount(a)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
            <div className="flex items-end justify-between mt-3">
              <div>
                <p className="tnum text-2xl font-bold">{formatMoney(a.balance, a.currency)}</p>
                {a.currency !== 'USD' && (
                  <p className="tnum text-[11px] text-muted-foreground">≈ {formatMoney(a.balanceUsd, 'USD')}</p>
                )}
              </div>
              <CurrencyBadge currency={a.currency} />
            </div>
          </div>
        ))}

        <button
          onClick={() => setDialog({ open: true, edit: null })}
          className="rounded-2xl border border-dashed border-white/15 p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-emerald-400/40 hover:text-emerald-300 transition-colors min-h-32"
        >
          <Plus size={22} />
          <span className="text-sm font-medium">Nueva cuenta o billetera</span>
        </button>
      </div>

      {accounts.length === 0 && (
        <EmptyState icon={<Wallet size={24} />} title="Sin cuentas todavía" hint="Agrega tu banco, efectivo o billetera digital" />
      )}

      <AccountDialog
        open={dialog.open}
        edit={dialog.edit}
        onClose={() => setDialog({ open: false, edit: null })}
      />
    </div>
  )
}

function AccountDialog({ open, edit, onClose }: { open: boolean; edit: AccountDTO | null; onClose: () => void }) {
  const { refreshOverview, refreshMeta } = useAppStore()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState('BANK')
  const [currency, setCurrency] = useState<Currency>('VES')
  const [initialBalance, setInitialBalance] = useState('0')
  const [color, setColor] = useState(COLOR_OPTIONS[0])
  const [icon, setIcon] = useState('wallet')
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  // reset al abrir
  const openKey = `${open}-${edit?.id ?? 'new'}`
  if (open && key !== openKey) {
    setKey(openKey)
    setName(edit?.name ?? '')
    setType(edit?.type ?? 'BANK')
    setCurrency((edit?.currency ?? 'VES') as Currency)
    setInitialBalance(String(edit?.initialBalance ?? 0))
    setColor(edit?.color ?? COLOR_OPTIONS[0])
    setIcon(edit?.icon ?? 'wallet')
  }

  const submit = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (edit) {
        await api.updateAccount(edit.id, {
          name: name.trim(),
          type,
          color,
          icon,
          initialBalance: parseAmount(initialBalance) || 0,
        })
        toast({ title: 'Cuenta actualizada ✓' })
      } else {
        await api.createAccount({
          name: name.trim(),
          type,
          currency,
          initialBalance: parseAmount(initialBalance) || 0,
          color,
          icon,
        })
        toast({ title: 'Cuenta creada ✓' })
      }
      onClose()
      await Promise.all([refreshOverview(), refreshMeta()])
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
          <DialogTitle>{edit ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              placeholder="Ej: Banesco, Efectivo $, Binance…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-secondary/40 border-white/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Moneda {edit ? '' : '(no editable luego)'}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)} disabled={!!edit}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CURRENCY_META[c].color }} />
                        {CURRENCY_META[c].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Saldo inicial (antes de los movimientos registrados)</Label>
            <Input
              inputMode="decimal"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="bg-secondary/40 border-white/10 tnum"
            />
          </div>
          <div>
            <Label>Icono</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((ic) => {
                const Ico = ICONS[ic]
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
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all',
                    color === c ? 'border-white scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!name.trim() || saving} className="font-semibold">
            {saving ? 'Guardando…' : edit ? 'Guardar' : 'Crear cuenta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
