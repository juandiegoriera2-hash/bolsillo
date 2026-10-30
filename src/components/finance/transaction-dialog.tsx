// ─────────────────────────────────────────────────────────────────
// Bolsillo — Diálogo de movimiento (crear / editar / confirmar OCR)
// ─────────────────────────────────────────────────────────────────
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from './store'
import { api } from './api'
import { useToast } from '@/hooks/use-toast'
import { CURRENCY_META, formatMoney, type Currency } from '@/lib/finance'
import { cn } from '@/lib/utils'
import { Camera, Check, Trash2 } from 'lucide-react'
import type { TxDTO } from './types'

const inputDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date()
  // fecha local Caracas (UTC-4) para el input date
  return new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10)
}

export function TransactionDialog() {
  const { txDialog, closeTxDialog, categories, tags, refreshOverview, refreshMeta } = useAppStore()
  const { toast } = useToast()
  const editing = txDialog.edit ?? null
  const prefill = txDialog.prefill ?? null

  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [date, setDate] = useState(inputDate())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const overview = useAppStore((s) => s.overview)
  const accounts = useMemo(() => overview?.accounts ?? [], [overview])

  // al abrir: precargar edición o prefill
  useEffect(() => {
    if (!txDialog.open) return
    if (editing) {
      setType(editing.type)
      setAmount(String(editing.amount))
      setAccountId(editing.accountId)
      setToAccountId(editing.toAccountId ?? '')
      setCategoryId(editing.categoryId ?? '')
      setDescription(editing.description ?? '')
      setReference(editing.reference ?? '')
      setTagIds(editing.tags.map((t) => t.id))
      setDate(inputDate(editing.date))
    } else {
      setType((prefill?.type as typeof type) ?? 'EXPENSE')
      setAmount(prefill?.amount != null ? String(prefill.amount) : '')
      setAccountId(
        prefill?.accountId ??
          (accounts.length
            ? (prefill?.currency
                ? accounts.find((a) => a.currency === prefill.currency)?.id
                : undefined) ?? accounts[0].id
            : '')
      )
      setToAccountId(prefill?.toAccountId ?? '')
      setCategoryId(prefill?.categoryId ?? '')
      setDescription(prefill?.description ?? '')
      setReference(prefill?.reference ?? '')
      setTagIds(prefill?.tagIds ?? [])
      setDate(prefill?.date ? inputDate(prefill.date) : inputDate())
    }
  }, [txDialog.open, editing, prefill])

  const account = accounts.find((a) => a.id === accountId)
  const currency: Currency = (account?.currency ?? 'VES') as Currency
  const toAccount = accounts.find((a) => a.id === toAccountId)
  const sameCurrencyAccounts = accounts.filter(
    (a) => a.currency === currency && a.id !== accountId
  )
  const kindCategories = categories.filter((c) =>
    type === 'INCOME' ? c.kind === 'INCOME' : c.kind === 'EXPENSE'
  )

  const amountNum = parseFloat(amount.replace(',', '.'))
  const valid =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    accountId &&
    (type !== 'TRANSFER' || (toAccountId && toAccount && toAccount.currency === currency))

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        type,
        amount: amountNum,
        accountId,
        description: description.trim() || null,
        date: `${date}T12:00:00`,
        tagIds,
        source: prefill?.reference ? 'OCR' : 'MANUAL',
      }
      if (type === 'TRANSFER') payload.toAccountId = toAccountId
      else payload.categoryId = categoryId || null
      if (reference.trim()) payload.reference = reference.trim()
      if (editing) {
        await api.updateTransaction(editing.id, payload)
        toast({ title: 'Movimiento actualizado ✓' })
      } else {
        await api.createTransaction(payload)
        toast({
          title: `${type === 'EXPENSE' ? 'Gasto' : type === 'INCOME' ? 'Ingreso' : 'Transferencia'} registrado ✓`,
          description: `${formatMoney(amountNum, currency)}${description.trim() ? ` · ${description.trim()}` : ''}`,
        })
      }
      closeTxDialog()
      await Promise.all([refreshOverview(), refreshMeta()])
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing || deleting) return
    setDeleting(true)
    try {
      await api.deleteTransaction(editing.id)
      toast({ title: 'Movimiento eliminado' })
      closeTxDialog()
      await refreshOverview()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const typeTabs: Array<{ id: 'EXPENSE' | 'INCOME' | 'TRANSFER'; label: string; color: string }> = [
    { id: 'EXPENSE', label: 'Gasto', color: '#f43f5e' },
    { id: 'INCOME', label: 'Ingreso', color: '#38e07f' },
    { id: 'TRANSFER', label: 'Transferencia', color: '#c084fc' },
  ]

  return (
    <Dialog open={txDialog.open} onOpenChange={(o) => !o && closeTxDialog()}>
      <DialogContent className="glass border-white/10 max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {prefill?.reference && <Camera size={17} className="text-amber-400" />}
            {editing ? 'Editar movimiento' : prefill?.reference ? 'Confirmar comprobante' : 'Nuevo movimiento'}
          </DialogTitle>
          <DialogDescription>
            {type === 'TRANSFER'
              ? 'Mueve dinero entre cuentas de la misma moneda.'
              : 'La moneda se toma de la cuenta seleccionada.'}
          </DialogDescription>
        </DialogHeader>

        {/* tipo */}
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-secondary/60 p-1">
          {typeTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setType(t.id)
                if (t.id !== 'TRANSFER') setToAccountId('')
              }}
              className={cn(
                'rounded-lg py-2 text-sm font-semibold transition-all',
                type === t.id ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'
              )}
              style={type === t.id ? { color: t.color } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* monto */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold" style={{ color: CURRENCY_META[currency].color }}>
              {CURRENCY_META[currency].short}
            </span>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-12 h-14 text-2xl font-bold tnum border-white/10 bg-secondary/40"
            />
          </div>
        </div>

        {/* cuentas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              {type === 'TRANSFER' ? 'Desde' : 'Cuenta'}
            </label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="bg-secondary/40 border-white/10">
                <SelectValue placeholder="Cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === 'TRANSFER' ? (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Hacia</label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue placeholder="Destino" />
                </SelectTrigger>
                <SelectContent>
                  {sameCurrencyAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Categoría</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {kindCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Fecha</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-secondary/40 border-white/10"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Referencia (opcional)</label>
            <Input
              placeholder="Nº de recibo"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="bg-secondary/40 border-white/10"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Descripción</label>
          <Input
            placeholder={type === 'INCOME' ? 'Ej: quincena, venta…' : 'Ej: mercado, taxi…'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-secondary/40 border-white/10"
          />
        </div>

        {/* etiquetas */}
        {tags.length > 0 && type !== 'TRANSFER' && (
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Etiquetas</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const active = tagIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-all border',
                      active ? 'text-background' : 'text-foreground/80'
                    )}
                    style={{
                      backgroundColor: active ? t.color : 'transparent',
                      borderColor: `${t.color}66`,
                    }}
                  >
                    {active && <Check size={11} className="inline mr-1" />}
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
          {editing ? (
            <Button
              variant="ghost"
              onClick={remove}
              disabled={deleting}
              className="text-rose-400 hover:text-rose-300 hover:bg-rose-400/10"
            >
              <Trash2 size={15} className="mr-1" /> Eliminar
            </Button>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-white/10">
              {prefill?.reference ? 'Datos leídos por OCR' : 'Registro manual'}
            </Badge>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeTxDialog}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={!valid || saving} className="font-semibold min-w-28">
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type { TxDTO }
