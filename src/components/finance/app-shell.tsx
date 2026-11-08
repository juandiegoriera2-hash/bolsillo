// ─────────────────────────────────────────────────────────────────
// Bolsillo — Shell de la aplicación (navegación + vistas)
// ─────────────────────────────────────────────────────────────────
'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from './store'
import { TransactionDialog } from './transaction-dialog'
import { PinGate } from './pin-gate'
import { cn } from '@/lib/utils'
import { formatRate } from '@/lib/finance'
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Bot,
  Camera,
  ChartPie,
  Coins,
  CreditCard,
  Home,
  LayoutGrid,
  ListOrdered,
  PiggyBank,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  RefreshCw,
  Wallet,
  WifiOff,
} from 'lucide-react'
import { queueLength, flushQueue } from '@/lib/offline-queue'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'

// vistas
import { DashboardView } from './views/dashboard-view'
import { TransactionsView } from './views/transactions-view'
import { AssistantView } from './views/assistant-view'
import { ScannerView } from './views/scanner-view'
import { AccountsView } from './views/accounts-view'
import { BudgetsView } from './views/budgets-view'
import { DebtsView } from './views/debts-view'
import { GoalsView } from './views/goals-view'
import { RatesView } from './views/rates-view'
import { SummaryView } from './views/summary-view'
import { SettingsView } from './views/settings-view'
import { MoreView } from './views/more-view'

export function BolsilloApp() {
  const { view, refreshOverview, refreshMeta, setInstallEvent } = useAppStore()

  // arranque: datos + registro del service worker + prompt de instalación
  useEffect(() => {
    // atajos PWA (/?view=assistant · /?view=scanner)
    const param = new URLSearchParams(window.location.search).get('view')
    if (param) {
      const views = [
        'dashboard', 'transactions', 'assistant', 'scanner', 'accounts',
        'budgets', 'debts', 'goals', 'rates', 'summary', 'settings', 'more',
      ]
      if (views.includes(param)) useAppStore.getState().setView(param as never)
    }

    refreshOverview().catch(() => {})
    refreshMeta().catch(() => {})

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as never)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [refreshOverview, refreshMeta, setInstallEvent])

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        <main className="flex-1 w-full max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-6 pb-32 md:pb-12 md:pt-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {renderView(view)}
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav />
      </div>
      <TransactionDialog />
      <PinGate />
    </div>
  )
}

// ── Indicador de conexión ────────────────────────────────────────
// Bolsillo es una PWA: sin conexión se abre con la última copia de los
// datos y los movimientos nuevos se guardan en el teléfono (cola offline).
// Al reconectar: se envía la cola y se re-sincroniza todo.

function OfflineBanner() {
  const { refreshOverview, refreshMeta } = useAppStore()
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const updatePending = () => setPending(queueLength())
    const goOffline = () => setOffline(true)
    const goOnline = async () => {
      setOffline(false)
      // enviar lo pendiente y re-sincronizar datos al recuperar conexión
      if (queueLength() > 0) {
        setSyncing(true)
        try {
          await flushQueue()
        } finally {
          setSyncing(false)
        }
      }
      refreshOverview().catch(() => {})
      refreshMeta().catch(() => {})
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    window.addEventListener('bolsillo:queued', updatePending)
    window.addEventListener('bolsillo:synced', updatePending)
    // sincronizar estado inicial (evita setState síncrono en el efecto)
    const raf = requestAnimationFrame(() => {
      setOffline(!navigator.onLine)
      setPending(queueLength())
    })
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('bolsillo:queued', updatePending)
      window.removeEventListener('bolsillo:synced', updatePending)
      cancelAnimationFrame(raf)
    }
  }, [refreshOverview, refreshMeta])

  // intento de sincronización al abrir la app (por si quedó pendiente)
  useEffect(() => {
    if (navigator.onLine && queueLength() > 0) {
      flushQueue().then((n) => {
        if (n > 0) {
          refreshOverview().catch(() => {})
          refreshMeta().catch(() => {})
        }
      })
    }
  }, [])

  return (
    <div role="status" aria-live="polite" className="px-4 sm:px-6 pt-2">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-amber-200">
        {syncing ? <RefreshCw size={18} className="shrink-0 animate-spin" aria-hidden /> : <WifiOff size={18} className="shrink-0" aria-hidden />}
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">
            {syncing ? 'Enviando…' : 'Sin conexión'}
            {pending > 0 && (
              <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold">
                ⏳ {pending} en espera
              </span>
            )}
          </p>
          <p className="text-[11px] leading-snug text-amber-200/70 mt-0.5">
            {pending > 0
              ? 'Tus movimientos nuevos se guardaron en el teléfono. Se envían solos al reconectar.'
              : syncing
                ? 'Enviando los movimientos pendientes…'
                : 'Puedes seguir anotando movimientos: se guardarán en el teléfono y se enviarán al reconectar.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function renderView(view: string) {
  switch (view) {
    case 'dashboard':
      return <DashboardView />
    case 'transactions':
      return <TransactionsView />
    case 'assistant':
      return <AssistantView />
    case 'scanner':
      return <ScannerView />
    case 'accounts':
      return <AccountsView />
    case 'budgets':
      return <BudgetsView />
    case 'debts':
      return <DebtsView />
    case 'goals':
      return <GoalsView />
    case 'rates':
      return <RatesView />
    case 'summary':
      return <SummaryView />
    case 'settings':
      return <SettingsView />
    case 'more':
      return <MoreView />
    default:
      return <DashboardView />
  }
}

// ── Navegación ───────────────────────────────────────────────────

const NAV_GROUPS: Array<{
  title: string
  items: Array<{ id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>
}> = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', label: 'Inicio', icon: Home },
      { id: 'transactions', label: 'Movimientos', icon: ListOrdered },
      { id: 'assistant', label: 'Asistente IA', icon: Bot },
      { id: 'scanner', label: 'Escanear recibo', icon: Camera },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { id: 'accounts', label: 'Cuentas', icon: Wallet },
      { id: 'budgets', label: 'Presupuestos', icon: ChartPie },
      { id: 'debts', label: 'Deudas', icon: CreditCard },
      { id: 'goals', label: 'Metas de ahorro', icon: Target },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { id: 'rates', label: 'Tasas y cambios', icon: Coins },
      { id: 'summary', label: 'Resumen IA semanal', icon: Sparkles },
      { id: 'settings', label: 'Ajustes', icon: Settings },
    ],
  },
]

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
        <Banknote size={19} className="text-emerald-950" strokeWidth={2.4} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-bold text-[15px] tracking-tight">Bolsillo</p>
          <p className="text-[10px] text-muted-foreground">Finanzas VE</p>
        </div>
      )}
    </div>
  )
}

function Sidebar() {
  const { view, setView, overview } = useAppStore()
  const rate = overview?.rates.paralelo
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/5 bg-[oklch(0.155_0.006_285)] sticky top-0 h-dvh">
      <div className="p-5 pb-3">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {g.title}
            </p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = view === item.id
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id as never)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      active
                        ? 'bg-emerald-400/12 text-emerald-300 shadow-[inset_0_0_0_1px] shadow-emerald-400/20'
                        : 'text-foreground/70 hover:bg-white/5 hover:text-foreground'
                    )}
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      {rate != null && (
        <div className="p-4 border-t border-white/5">
          <div className="glass rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Paralelo ahora</p>
            <p className="tnum font-bold text-emerald-300">{formatRate(rate)}</p>
          </div>
        </div>
      )}
    </aside>
  )
}

function BottomNav() {
  const { view, setView } = useAppStore()
  const items = [
    { id: 'dashboard', label: 'Inicio', icon: Home },
    { id: 'transactions', label: 'Movs', icon: ListOrdered },
    { id: '__fab__', label: '', icon: Plus },
    { id: 'assistant', label: 'Asistente', icon: Bot },
    { id: 'more', label: 'Más', icon: LayoutGrid },
  ]
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 safe-bottom">
      <div className="glass border-t border-white/10 px-2 pt-1.5 pb-1.5 flex items-stretch justify-around">
        {items.map((item) => {
          if (item.id === '__fab__') return <QuickAdd key="fab" />
          const active = view === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as never)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-16 transition-all',
                active ? 'text-emerald-300' : 'text-muted-foreground active:scale-95'
              )}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ── Botón central + hoja de registro rápido ─────────────────────

export function QuickAdd({ floating = false }: { floating?: boolean }) {
  const { setView, openTxDialog, overview } = useAppStore()
  const { toast } = useToast()
  const accounts = overview?.accounts ?? []

  if (floating) {
    return (
      <Button
        onClick={() => document.getElementById('quick-add-trigger')?.click()}
        className="md:hidden fixed right-5 bottom-24 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-emerald-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-400/40 transition-shadow"
        size="icon"
        aria-label="Registrar movimiento"
      >
        <Plus size={26} strokeWidth={2.6} />
      </Button>
    )
  }

  const defaultBsAccount = accounts.find((a) => a.currency === 'VES') ?? accounts[0]

  const options = [
    {
      icon: <ArrowUpRight size={19} className="text-rose-400" />,
      title: 'Gasto',
      desc: 'Registrar un egreso',
      action: () => openTxDialog({ prefill: { type: 'EXPENSE', accountId: defaultBsAccount?.id } }),
    },
    {
      icon: <TrendingUp size={19} className="text-emerald-400" />,
      title: 'Ingreso',
      desc: 'Registrar un ingreso',
      action: () => openTxDialog({ prefill: { type: 'INCOME' } }),
    },
    {
      icon: <Camera size={19} className="text-amber-400" />,
      title: 'Escanear comprobante',
      desc: 'Pago Móvil, transferencias, Binance…',
      action: () => setView('scanner'),
    },
    {
      icon: <ArrowLeftRight size={19} className="text-violet-300" />,
      title: 'Cambio de divisa',
      desc: 'Calcula el diferencial cambiario',
      action: () => setView('rates'),
    },
    {
      icon: <Receipt size={19} className="text-teal-300" />,
      title: 'Deuda',
      desc: 'Por pagar o por cobrar',
      action: () => setView('debts'),
    },
    {
      icon: <PiggyBank size={19} className="text-lime-300" />,
      title: 'Aporte a meta',
      desc: 'Suma a tus ahorros indexados',
      action: () => setView('goals'),
    },
  ]

  return (
    <Sheet>
      <SheetTrigger
        id="quick-add-trigger"
        className="flex flex-col items-center gap-0.5 px-2 pt-1.5 pb-0.5 min-w-16"
        aria-label="Agregar movimiento"
      >
        <span className="w-11 h-11 -mt-4 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 text-emerald-950">
          <Plus size={24} strokeWidth={2.6} />
        </span>
      </SheetTrigger>
      <SheetContent side="bottom" className="glass border-white/10 rounded-t-3xl px-5 pb-8 pt-2">
        <SheetHeader className="px-0 pb-2">
          <SheetTitle className="text-left text-base">¿Qué quieres registrar?</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3">
          {options.map((o) => (
            <button
              key={o.title}
              onClick={o.action}
              className="glass rounded-2xl p-4 text-left active:scale-[0.97] transition-transform hover:border-white/15"
            >
              <div className="w-9 h-9 rounded-xl bg-secondary/70 flex items-center justify-center mb-2.5">
                {o.icon}
              </div>
              <p className="text-sm font-semibold">{o.title}</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{o.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Tip: el asistente de IA también registra con frases como “gasté 4.500 en almuerzo”
        </p>
      </SheetContent>
    </Sheet>
  )
}
