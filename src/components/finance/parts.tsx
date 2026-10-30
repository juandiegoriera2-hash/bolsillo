// ─────────────────────────────────────────────────────────────────
// Bolsillo — Partes UI compartidas
// ─────────────────────────────────────────────────────────────────
'use client'

import { cn } from '@/lib/utils'
import { CURRENCY_META, formatMoney, formatRate, type Currency } from '@/lib/finance'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Baby,
  Banknote,
  Bitcoin,
  Briefcase,
  Bus,
  Car,
  CircleDashed,
  Clapperboard,
  Coffee,
  Coins,
  Dog,
  DollarSign,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Lightbulb,
  Palmtree,
  PiggyBank,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  car: Car,
  home: Home,
  lightbulb: Lightbulb,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  clapperboard: Clapperboard,
  'shopping-bag': ShoppingBag,
  'circle-dashed': CircleDashed,
  users: Users,
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  gift: Gift,
  shirt: ShoppingBag,
  bus: Bus,
  'gamepad-2': Gamepad2,
  'piggy-bank': PiggyBank,
  wallet: Wallet,
  landmark: Landmark,
  banknote: Banknote,
  'dollar-sign': DollarSign,
  bitcoin: Bitcoin,
  coins: Coins,
  target: Target,
  'shield-check': ShieldCheck,
  palmtree: Palmtree,
  plane: Plane,
  baby: Baby,
  dog: Dog,
  zap: Zap,
  sparkles: Sparkles,
}

export function CatIcon({
  icon,
  color,
  size = 16,
  className,
}: {
  icon?: string | null
  color?: string | null
  size?: number
  className?: string
}) {
  const Ico = (icon && ICONS[icon]) || CircleDashed
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-lg shrink-0', className)}
      style={{
        width: size * 2.05,
        height: size * 2.05,
        backgroundColor: `${color ?? '#94a3b8'}22`,
        color: color ?? '#94a3b8',
      }}
    >
      <Ico size={size} strokeWidth={2.1} />
    </span>
  )
}

export function Money({
  amount,
  currency,
  className,
  colored = false,
  sign = false,
  compact = false,
}: {
  amount: number
  currency: string
  className?: string
  colored?: boolean
  sign?: boolean
  compact?: boolean
}) {
  const value = compact ? compactMoney(amount) : formatMoney(amount, currency as Currency)
  const display = sign && amount > 0 ? `+${value}` : value
  return (
    <span
      className={cn(
        'tnum',
        colored && (amount < 0 ? 'text-rose-400' : amount > 0 ? 'text-emerald-400' : ''),
        className
      )}
    >
      {display}
    </span>
  )
}

function compactMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const f = (v: number, d = 1) => v.toFixed(d).replace('.', ',')
  if (abs >= 1_000_000) return `${sign}${f(abs / 1_000_000, abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${sign}${f(abs / 1000, 0)}k`
  if (abs >= 1000) return `${sign}${f(abs / 1000, 1)}k`
  return `${sign}${abs % 1 === 0 ? abs.toFixed(0) : f(abs)}`
}

export function CurrencyDot({ currency, size = 8 }: { currency: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, backgroundColor: CURRENCY_META[currency as Currency]?.color ?? '#94a3b8' }}
    />
  )
}

export function CurrencyBadge({ currency, className }: { currency: string; className?: string }) {
  const meta = CURRENCY_META[currency as Currency]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        className
      )}
      style={{ backgroundColor: `${meta?.color ?? '#94a3b8'}1f`, color: meta?.color ?? '#94a3b8' }}
    >
      {meta?.short ?? currency}
    </span>
  )
}

export function TxTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'INCOME')
    return <ArrowDownLeft className={cn('text-emerald-400', className)} size={15} strokeWidth={2.4} />
  if (type === 'TRANSFER')
    return <ArrowLeftRight className={cn('text-violet-300', className)} size={15} strokeWidth={2.4} />
  return <ArrowUpRight className={cn('text-rose-400', className)} size={15} strokeWidth={2.4} />
}

export function SourceBadge({ source }: { source: string }) {
  if (source === 'MANUAL') return null
  const map: Record<string, { label: string; color: string }> = {
    AI_CHAT: { label: 'IA', color: '#a3e635' },
    VOICE: { label: '🎙️ Voz', color: '#2dd4bf' },
    OCR: { label: '📷 OCR', color: '#f5b544' },
  }
  const m = map[source]
  if (!m) return null
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: `${m.color}1c`, color: m.color }}
    >
      {m.label}
    </span>
  )
}

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-2 mb-3', className)}>
      <h2 className="text-sm font-semibold text-foreground/90 tracking-wide uppercase">{title}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-14 h-14 rounded-2xl bg-secondary/60 flex items-center justify-center text-muted-foreground mb-4">
        {icon ?? <CircleDashed size={26} />}
      </div>
      <p className="font-medium text-foreground/85">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1 max-w-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ViewHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-5 md:pt-8 pb-4">
      <h1 className="text-2xl md:text-[1.7rem] font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  )
}

/** Barra de presupuesto con estados de color */
export function BudgetBar({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.min(100, pct)
  const color = pct >= 100 ? '#f43f5e' : pct >= 85 ? '#f5b544' : '#38e07f'
  return (
    <div className={cn('h-2 rounded-full bg-secondary overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color, boxShadow: `0 0 12px ${color}55` }}
      />
    </div>
  )
}

export function DeltaBadge({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const up = value >= 0
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        up ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'
      )}
    >
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1).replace('.', ',')}
      {suffix}
    </span>
  )
}

export function RateCard({
  label,
  value,
  color,
  delta,
  onClick,
}: {
  label: string
  value: number | null
  color: string
  delta?: number | null
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="glass rounded-2xl p-4 text-left transition-transform active:scale-[0.98] hover:border-white/10 min-w-0 flex-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
        {delta != null && <DeltaBadge value={delta} />}
      </div>
      <p className="tnum text-xl md:text-2xl font-bold mt-2 truncate" title={formatRate(value)}>
        {value != null ? formatRate(value) : '—'}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">por 1 USD</p>
    </button>
  )
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="link" size="sm" asChild className="h-7 px-2 text-emerald-400">
      <Link href={href}>{children}</Link>
    </Button>
  )
}
