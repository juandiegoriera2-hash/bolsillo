'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { CatIcon, EmptyState, SourceBadge, ViewHeader } from '../parts'
import { dayLabel } from '../fmt'
import { formatMoney } from '@/lib/finance'
import { cn } from '@/lib/utils'
import type { TxDTO } from '../types'
import { readQueue, removeQueued, queuedSummary, type QueuedItem } from '@/lib/offline-queue'
import { Clock, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { ImportDialog } from '../import-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const TYPE_FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'EXPENSE', label: 'Gastos' },
  { id: 'INCOME', label: 'Ingresos' },
  { id: 'TRANSFER', label: 'Transf.' },
]

export function TransactionsView() {
  const { overview, categories, tags, openTxDialog } = useAppStore()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [tagId, setTagId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const [items, setItems] = useState<TxDTO[]>([])
  const [sums, setSums] = useState({ incomeUsd: 0, expenseUsd: 0 })
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [pendingQueue, setPendingQueue] = useState<QueuedItem[]>([])

  // cola offline: movimientos guardados en el teléfono esperando internet
  useEffect(() => {
    const upd = () => setPendingQueue(readQueue())
    upd()
    window.addEventListener('bolsillo:queued', upd)
    window.addEventListener('bolsillo:synced', upd)
    return () => {
      window.removeEventListener('bolsillo:queued', upd)
      window.removeEventListener('bolsillo:synced', upd)
    }
  }, [])

  const load = useCallback(
    async (off: number, replace: boolean) => {
      setLoading(true)
      try {
        const res = await api.transactions({
          q: q || undefined,
          type: type || undefined,
          tagId: tagId || undefined,
          categoryId: categoryId || undefined,
          accountId: accountId || undefined,
          limit: 50,
          offset: off,
        })
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]))
        setSums({ incomeUsd: res.incomeUsd, expenseUsd: res.expenseUsd })
        setTotal(res.total)
        setHasMore(res.hasMore)
      } finally {
        setLoading(false)
      }
    },
    [q, type, tagId, categoryId, accountId]
  )

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0)
      load(0, true)
    }, 280)
    return () => clearTimeout(t)
  }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, TxDTO[]>()
    for (const t of items) {
      const key = dayLabel(t.date)
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [items])

  const hasFilters = !!(type || tagId || categoryId || accountId || q)
  const accounts = overview?.accounts ?? []

  return (
    <div className="pb-4">
      <ViewHeader title="Movimientos" subtitle={`${total} registro(s) · filtros y etiquetas rápidas`} />

      {/* búsqueda + filtros */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar descripción o referencia…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-secondary/40 border-white/10 h-10"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setImportOpen(true)}
          className="h-10 w-10 border-white/10 bg-secondary/40 hover:border-emerald-400/40 hover:text-emerald-300"
          aria-label="Importar estado de cuenta del banco"
          title="Importar estado de cuenta del banco"
        >
          <Upload size={15} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'h-10 w-10 border-white/10 bg-secondary/40',
            hasFilters && 'border-emerald-400/40 text-emerald-300'
          )}
          aria-label="Filtros"
        >
          <SlidersHorizontal size={15} />
        </Button>
      </div>

      {/* chips tipo + hormiga */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setType(f.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all shrink-0',
              type === f.id
                ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300'
                : 'border-white/10 text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
        {tags
          .filter((t) => t.name.toLowerCase().includes('hormiga'))
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTagId(tagId === t.id ? '' : t.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all shrink-0',
                tagId === t.id
                  ? 'bg-rose-400/15 border-rose-400/40 text-rose-300'
                  : 'border-white/10 text-muted-foreground hover:text-foreground'
              )}
            >
              🐜 {t.name}
            </button>
          ))}
      </div>

      {showFilters && (
        <div className="glass rounded-2xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Categoría</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-9 bg-secondary/40 border-white/10 text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Cuenta</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-9 bg-secondary/40 border-white/10 text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todas</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Etiqueta</label>
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger className="h-9 bg-secondary/40 border-white/10 text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todas</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* resumen del filtro */}
      <div className="flex items-center gap-2 mb-3 text-xs">
        <Badge variant="outline" className="border-emerald-400/30 text-emerald-300 tnum">
          ↘ {formatMoney(sums.expenseUsd, 'USD', true)} gastos
        </Badge>
        <Badge variant="outline" className="border-rose-400/30 text-rose-300 tnum">
          ↗ {formatMoney(sums.incomeUsd, 'USD', true)} ingresos
        </Badge>
        {hasFilters && (
          <button
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            onClick={() => {
              setType('')
              setTagId('')
              setCategoryId('')
              setAccountId('')
              setQ('')
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* cola offline: pendientes por enviar */}
      {pendingQueue.length > 0 && (
        <div className="glass rounded-2xl border border-amber-400/25 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-amber-300" />
            <p className="text-xs font-semibold text-amber-200">
              {pendingQueue.length} en espera — sin conexión
            </p>
            <span className="text-[10px] text-amber-200/70">se envían solos al reconectar</span>
          </div>
          <div className="max-h-44 overflow-y-auto pr-1 space-y-1.5">
            {pendingQueue.map((q) => (
              <div key={q.id} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
                <span className="flex-1 truncate text-foreground/85">{queuedSummary(q)}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(q.ts).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => removeQueued(q.id)}
                  className="text-muted-foreground hover:text-rose-400 shrink-0"
                  aria-label="Descartar movimiento pendiente"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* lista */}
      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Sin movimientos que coincidan"
          hint="Cambia los filtros o registra uno nuevo con el botón +"
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, txs]) => (
            <div key={day}>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {day}
                </p>
                <p className="text-[11px] text-muted-foreground tnum">
                  {(() => {
                    const inc = txs.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)
                    const exp = txs.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
                    const parts: string[] = []
                    const cur = txs[0]?.currency ?? 'VES'
                    if (exp > 0) parts.push(`−${formatMoney(exp, cur as never)}`)
                    if (inc > 0) parts.push(`+${formatMoney(inc, cur as never)}`)
                    return parts.join(' · ')
                  })()}
                </p>
              </div>
              <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
                {txs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTxDialog({ edit: t })}
                    className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <CatIcon icon={t.categoryIcon ?? t.accountIcon} color={t.categoryColor ?? t.accountColor} size={17} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate max-w-52">{t.description ?? t.categoryName ?? 'Movimiento'}</p>
                        <SourceBadge source={t.source} />
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {t.type === 'TRANSFER'
                          ? `${t.accountName} → ${t.toAccountName}`
                          : `${t.accountName}${t.categoryName ? ` · ${t.categoryName}` : ''}`}
                        {t.reference ? ` · Ref ${t.reference}` : ''}
                      </p>
                      {t.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {t.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                              style={{ backgroundColor: `${tag.color}1f`, color: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <p
                        className={cn(
                          'tnum text-sm font-semibold',
                          t.type === 'INCOME' && 'text-emerald-400',
                          t.type === 'EXPENSE' && 'text-foreground/90',
                          t.type === 'TRANSFER' && 'text-violet-300'
                        )}
                      >
                        {t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '−' : ''}
                        {formatMoney(t.amount, t.currency as never)}
                      </p>
                      {t.originalAmount != null && t.originalCurrency && (
                        <p className="tnum text-[10px] text-muted-foreground">
                          anotado {formatMoney(t.originalAmount, t.originalCurrency as never)}
                          {t.rateSource === 'MANUAL'
                            ? ' · tasa propia'
                            : t.rateSource === 'BCV'
                              ? ' · BCV'
                              : t.rateSource === 'PARALELO'
                                ? ' · paralelo'
                                : t.rateSource === 'USDT_P2P'
                                  ? ' · USDT'
                                  : ''}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full border-white/10 bg-secondary/40"
              disabled={loading}
              onClick={() => {
                const next = offset + 50
                setOffset(next)
                load(next, false)
              }}
            >
              {loading ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </div>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
