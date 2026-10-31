'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { CurrencyBadge, DeltaBadge, EmptyState, ViewHeader } from '../parts'
import { dateKeyShort, fullDateTime, shortDate } from '../fmt'
import { formatMoney, formatRate, parseAmount } from '@/lib/finance'
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
import { cn } from '@/lib/utils'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { ArrowLeftRight, Pencil, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import type { ExchangeDTO, RateHistoryPoint } from '../types'

const SOURCE_COLORS: Record<string, string> = {
  BCV: '#f5b544',
  PARALELO: '#38e07f',
  USDT_P2P: '#2dd4bf',
  EUR: '#c084fc',
}

type RateKey = 'bcv' | 'paralelo' | 'usdt' | 'eurBcv'

/** valor actual de una tasa desde el snapshot */
const snapValue = (rates: { bcv: number | null; paralelo: number | null; usdt: number | null; eurBcv: number | null } | null | undefined, key: RateKey) =>
  key === 'eurBcv' ? rates?.eurBcv ?? null : rates?.[key] ?? null

/** valor de una tasa en un punto del historial */
const histValue = (h: RateHistoryPoint, key: RateKey) =>
  key === 'eurBcv' ? h.eur : h[key]

export function RatesView() {
  const { overview, refreshOverview } = useAppStore()
  const { toast } = useToast()
  const [history, setHistory] = useState<RateHistoryPoint[] | null>(null)
  const [exchanges, setExchanges] = useState<{ items: ExchangeDTO[]; gainedUsd: number; lostUsd: number; netUsd: number } | null>(null)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [visible, setVisible] = useState<string[]>(['bcv', 'paralelo', 'usdt', 'eurBcv'])
  const [refreshing, setRefreshing] = useState(false)

  const rates = overview?.rates
  const hist = history ?? overview?.history ?? []

  const loadExchanges = async () => {
    const [h, e] = await Promise.all([api.rates(), api.exchanges()])
    setHistory(h.history)
    setExchanges(e)
  }
  useEffect(() => {
    loadExchanges().catch(() => {})
  }, [])

  const chartData = hist.map((h) => ({
    day: dateKeyShort(h.dateKey),
    bcv: h.bcv ? +h.bcv.toFixed(2) : null,
    paralelo: h.paralelo ? +h.paralelo.toFixed(2) : null,
    usdt: h.usdt ? +h.usdt.toFixed(2) : null,
    eurBcv: h.eur ? +h.eur.toFixed(2) : null,
  }))

  const variation = (key: RateKey) => {
    if (hist.length < 2 || !rates) return null
    const before = histValue(hist[hist.length - 2], key)
    const now = snapValue(rates, key)
    if (!now || !before) return null
    return ((now - before) / before) * 100
  }

  const monthVar = (key: RateKey) => {
    if (hist.length < 8 || !rates) return null
    const before = histValue(hist[hist.length - 8], key)
    const now = snapValue(rates, key)
    if (!now || !before) return null
    return ((now - before) / before) * 100
  }

  const doRefresh = async () => {
    setRefreshing(true)
    try {
      await api.refreshRates()
      await Promise.all([refreshOverview(), loadExchanges()])
      toast({ title: 'Tasas actualizadas ✓', description: 'BCV (dolarapi) y USDT (Binance P2P)' })
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setRefreshing(false)
    }
  }

  const toggleSeries = (k: string) =>
    setVisible((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))

  return (
    <div className="pb-4">
      <ViewHeader
        title="Tasas y cambios"
        subtitle="Motor multimoneda: BCV, paralelo, USDT P2P y euro BCV · actualización diaria"
      />

      {/* tarjetas de tasas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {(
          [
            { key: 'bcv', label: 'BCV Oficial', color: SOURCE_COLORS.BCV },
            { key: 'paralelo', label: 'Paralelo', color: SOURCE_COLORS.PARALELO },
            { key: 'usdt', label: 'USDT P2P', color: SOURCE_COLORS.USDT_P2P },
            { key: 'eurBcv', label: 'Euro BCV', color: SOURCE_COLORS.EUR },
          ] as const
        ).map((s) => (
          <div key={s.key} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: s.color }}>
                {s.label}
              </span>
            </div>
            <p className="tnum text-xl md:text-2xl font-bold">{formatRate(snapValue(rates, s.key))}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {variation(s.key) != null && <DeltaBadge value={variation(s.key)!} />}
              {monthVar(s.key) != null && (
                <span className="text-[10px] text-muted-foreground">7d: {monthVar(s.key)!.toFixed(1)}%</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant="outline"
          className="border-white/10 bg-secondary/40 flex-1"
          onClick={doRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={cn('mr-1.5', refreshing && 'animate-spin')} /> Actualizar tasas
        </Button>
        <Button variant="outline" className="border-white/10 bg-secondary/40" onClick={() => setManualOpen(true)}>
          <Pencil size={14} className="mr-1.5" /> Manual
        </Button>
      </div>

      {/* gráfico */}
      <section className="glass rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-sm">Historial 30 días</h3>
          <div className="flex gap-1.5 flex-wrap">
            {(
              [
                { id: 'bcv', label: 'BCV', color: SOURCE_COLORS.BCV },
                { id: 'paralelo', label: 'Paralelo', color: SOURCE_COLORS.PARALELO },
                { id: 'usdt', label: 'USDT', color: SOURCE_COLORS.USDT_P2P },
                { id: 'eurBcv', label: '€ BCV', color: SOURCE_COLORS.EUR },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => toggleSeries(s.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-all',
                  visible.includes(s.id) ? '' : 'opacity-35'
                )}
                style={{ borderColor: `${s.color}55`, color: s.color }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? (
          <Skeleton className="h-56 rounded-xl" />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fill: '#8b8fa3', fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis
                  domain={['dataMin - 15', 'dataMax + 15']}
                  tick={{ fill: '#8b8fa3', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => `${Math.round(v)}`}
                />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="font-semibold mb-1">{label}</p>
                        {payload.map((p) => (
                          <p key={p.name} className="tnum flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name === 'bcv' ? 'BCV' : p.name === 'paralelo' ? 'Paralelo' : p.name === 'usdt' ? 'USDT' : 'Euro BCV'}: Bs{' '}
                            {Number(p.value).toFixed(2)}
                          </p>
                        ))}
                      </div>
                    ) : null
                  }
                />
                <Legend
                  formatter={(v) => (
                    <span className="text-[11px] text-muted-foreground">
                      {v === 'bcv' ? 'BCV' : v === 'paralelo' ? 'Paralelo' : v === 'usdt' ? 'USDT P2P' : 'Euro BCV'}
                    </span>
                  )}
                />
                {visible.includes('bcv') && <Line type="monotone" dataKey="bcv" stroke={SOURCE_COLORS.BCV} strokeWidth={2} dot={false} />}
                {visible.includes('paralelo') && <Line type="monotone" dataKey="paralelo" stroke={SOURCE_COLORS.PARALELO} strokeWidth={2} dot={false} />}
                {visible.includes('usdt') && <Line type="monotone" dataKey="usdt" stroke={SOURCE_COLORS.USDT_P2P} strokeWidth={2} dot={false} strokeDasharray="4 3" />}
                {visible.includes('eurBcv') && <Line type="monotone" dataKey="eurBcv" stroke={SOURCE_COLORS.EUR} strokeWidth={2} dot={false} strokeDasharray="2 3" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* cambios de divisa */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-sm">Cambios de divisa</h3>
            <p className="text-[11px] text-muted-foreground">
              Auditoría de diferenciales: qué tan bien cambiaste vs el mercado
            </p>
          </div>
          <Button
            size="sm"
            className="bg-violet-400 text-violet-950 hover:bg-violet-300 font-semibold h-8"
            onClick={() => setExchangeOpen(true)}
          >
            <ArrowLeftRight size={14} className="mr-1" /> Cambiar
          </Button>
        </div>

        {exchanges && (exchanges.gainedUsd > 0.005 || exchanges.lostUsd > 0.005) && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">Ganado</p>
              <p className="tnum font-bold text-emerald-400">${exchanges.gainedUsd.toFixed(2)}</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">Perdido</p>
              <p className="tnum font-bold text-rose-400">${exchanges.lostUsd.toFixed(2)}</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Neto</p>
              <p className={cn('tnum font-bold', exchanges.netUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                ${exchanges.netUsd.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {!exchanges ? (
          <div className="space-y-2">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : exchanges.items.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={24} />}
            title="Sin cambios registrados"
            hint="Cuando cambies Bs por divisas (o viceversa), registralo aquí para auditar si ganaste o perdiste vs la tasa del mercado."
          />
        ) : (
          <div className="space-y-2.5">
            {exchanges.items.map((e) => {
              const gain = e.differential >= 0
              const bsInvolved = e.fromCurrency === 'VES' || e.toCurrency === 'VES'
              return (
                <div key={e.id} className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center',
                          gain ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'
                        )}
                      >
                        {gain ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {formatMoney(e.fromAmount, e.fromCurrency as never)} →{' '}
                          {formatMoney(e.toAmount, e.toCurrency as never)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {e.fromAccountName} → {e.toAccountName} · {shortDate(e.date)}
                          {e.note ? ` · ${e.note}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn('tnum text-sm font-bold', gain ? 'text-emerald-400' : 'text-rose-400')}>
                        {gain ? '+' : '−'}
                        {bsInvolved
                          ? formatMoney(Math.abs(e.differential), 'VES')
                          : `${Math.abs(e.differential).toFixed(2)} ${e.toCurrency}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {gain ? 'a favor' : 'en contra'} vs {e.marketSource === 'PARALELO' ? 'paralelo' : e.marketSource === 'BCV' ? 'BCV' : 'USDT'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-white/5 text-[11px] text-muted-foreground tnum flex-wrap">
                    <span>
                      Tu tasa: <span className="text-foreground/85">{bsInvolved ? formatRate(e.impliedRate) : e.impliedRate.toFixed(3)}</span>
                    </span>
                    <span>
                      Mercado: <span className="text-foreground/85">{bsInvolved ? formatRate(e.marketRate) : e.marketRate.toFixed(3)}</span>
                    </span>
                    <span className="ml-auto">≈ ${Math.abs(e.differentialUsd).toFixed(2)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ExchangeDialog
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        onSaved={async () => {
          await loadExchanges()
          await refreshOverview()
        }}
      />
      <ManualRateDialog open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  )
}

function ExchangeDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { overview } = useAppStore()
  const { toast } = useToast()
  const accounts = overview?.accounts ?? []
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [note, setNote] = useState('')
  const [marketSource, setMarketSource] = useState('PARALELO')
  const [saving, setSaving] = useState(false)

  const from = accounts.find((a) => a.id === fromAccountId)
  const to = accounts.find((a) => a.id === toAccountId)
  const rates = overview?.rates

  const implied = useMemo(() => {
    const fa = parseAmount(fromAmount)
    const ta = parseAmount(toAmount)
    if (!from || !to || !Number.isFinite(fa) || !Number.isFinite(ta) || fa <= 0 || ta <= 0) return null
    if (from.currency === 'VES' && to.currency !== 'VES') return fa / ta
    if (from.currency !== 'VES' && to.currency === 'VES') return ta / fa
    return ta / fa
  }, [from, to, fromAmount, toAmount])

  const marketRate = useMemo(() => {
    if (!rates || !from || !to) return null
    const usd = marketSource === 'BCV' ? rates.bcv : marketSource === 'USDT_P2P' ? rates.usdt : rates.paralelo
    if (!usd) return null
    const rateFor = (c: string) =>
      c === 'USD' ? usd : c === 'USDT' ? (rates.usdt ?? usd) : c === 'EUR' ? usd * rates.eurUsd : 1
    if (from.currency === 'VES' && to.currency !== 'VES') return rateFor(to.currency)
    if (from.currency !== 'VES' && to.currency === 'VES') return rateFor(from.currency)
    const rf = rateFor(from.currency)
    const rt = rateFor(to.currency)
    return rf && rt ? rf / rt : null
  }, [rates, from, to, marketSource])

  const diff = useMemo(() => {
    if (implied == null || marketRate == null || !fromAmount) return null
    const fa = parseAmount(fromAmount)
    return (implied - marketRate) * (from?.currency === 'VES' ? parseAmount(toAmount) : fa)
  }, [implied, marketRate, fromAmount, toAmount, from])

  const valid =
    fromAccountId && toAccountId && fromAccountId !== toAccountId && from && to && from.currency !== to.currency &&
    parseAmount(fromAmount) > 0 && parseAmount(toAmount) > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await api.createExchange({
        fromAccountId,
        toAccountId,
        fromAmount: parseAmount(fromAmount),
        toAmount: parseAmount(toAmount),
        marketSource,
        note: note.trim() || null,
      })
      toast({ title: 'Cambio registrado ✓', description: 'Los saldos de ambas cuentas se actualizaron' })
      onClose()
      setFromAmount('')
      setToAmount('')
      setNote('')
      await onSaved()
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
          <DialogTitle>Cambio de divisa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Entregas desde</Label>
              <Select value={fromAccountId} onValueChange={setFromAccountId}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue placeholder="Cuenta origen" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recibes en</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue placeholder="Cuenta destino" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== fromAccountId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {from && to && from.currency === to.currency && (
            <p className="text-xs text-amber-400">
              Las dos cuentas usan la misma moneda: eso es una Transferencia, no un cambio.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto que entregas {from ? `(${from.currency})` : ''}</Label>
              <Input inputMode="decimal" placeholder="0,00" value={fromAmount} onChange={(e) => setFromAmount(e.target.value)} className="bg-secondary/40 border-white/10 tnum h-11 text-lg font-bold" />
            </div>
            <div>
              <Label>Monto que recibes {to ? `(${to.currency})` : ''}</Label>
              <Input inputMode="decimal" placeholder="0,00" value={toAmount} onChange={(e) => setToAmount(e.target.value)} className="bg-secondary/40 border-white/10 tnum h-11 text-lg font-bold" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Comparar contra</Label>
              <Select value={marketSource} onValueChange={setMarketSource}>
                <SelectTrigger className="bg-secondary/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARALELO">Paralelo</SelectItem>
                  <SelectItem value="BCV">BCV</SelectItem>
                  <SelectItem value="USDT_P2P">USDT P2P</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Input placeholder="Ej: venta P2P" value={note} onChange={(e) => setNote(e.target.value)} className="bg-secondary/40 border-white/10" />
            </div>
          </div>

          {implied != null && marketRate != null && (
            <div className="glass rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tu tasa implícita</span>
                <span className="tnum font-semibold">{from?.currency === 'VES' || to?.currency === 'VES' ? formatRate(implied) : implied.toFixed(3)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tasa de mercado ({marketSource === 'PARALELO' ? 'paralelo' : marketSource === 'BCV' ? 'BCV' : 'USDT'})</span>
                <span className="tnum font-semibold">{from?.currency === 'VES' || to?.currency === 'VES' ? formatRate(marketRate) : marketRate.toFixed(3)}</span>
              </div>
              {diff != null && (
                <div className="flex justify-between pt-1.5 border-t border-white/5">
                  <span className="text-muted-foreground">Diferencial</span>
                  <span className={cn('tnum font-bold', diff >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {diff >= 0 ? '▲ ganas ' : '▼ pierdes '}
                    {from?.currency === 'VES' || to?.currency === 'VES' ? formatMoney(Math.abs(diff), 'VES') : Math.abs(diff).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!valid || saving} className="font-semibold bg-violet-400 text-violet-950 hover:bg-violet-300">
            {saving ? 'Registrando…' : 'Registrar cambio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManualRateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshOverview } = useAppStore()
  const { toast } = useToast()
  const [source, setSource] = useState('PARALELO')
  const [usd, setUsd] = useState('')
  const [eur, setEur] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const v = parseAmount(usd)
    const ev = parseAmount(eur)
    if (!Number.isFinite(v) || v <= 0 || saving) return
    setSaving(true)
    try {
      await api.setRate(source, v, Number.isFinite(ev) && ev > 0 ? ev : undefined)
      toast({ title: 'Tasa fijada manualmente ✓' })
      onClose()
      setUsd('')
      setEur('')
      await refreshOverview()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass border-white/10 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fijar tasa manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Fuente</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="bg-secondary/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BCV">BCV Oficial</SelectItem>
                <SelectItem value="PARALELO">Paralelo</SelectItem>
                <SelectItem value="USDT_P2P">USDT P2P</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bs por 1 USD</Label>
            <Input inputMode="decimal" placeholder="0,00" value={usd} onChange={(e) => setUsd(e.target.value)} className="bg-secondary/40 border-white/10 tnum h-12 text-xl font-bold" />
          </div>
          <div>
            <Label>Bs por 1 EUR (opcional)</Label>
            <Input inputMode="decimal" placeholder="se deriva del cruce €/$ si lo dejas vacío" value={eur} onChange={(e) => setEur(e.target.value)} className="bg-secondary/40 border-white/10 tnum h-11" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Útil si quieres valorar tu patrimonio con una tasa pactada específica.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="font-semibold">
            {saving ? 'Guardando…' : 'Fijar tasa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
