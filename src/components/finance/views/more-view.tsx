'use client'

import { useAppStore } from '../store'
import { ViewHeader } from '../parts'
import { cn } from '@/lib/utils'
import {
  Bot,
  Camera,
  ChartPie,
  Coins,
  CreditCard,
  Settings,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'

const MODULES = [
  { id: 'accounts', label: 'Cuentas y billeteras', desc: 'Bs, $, USDT, €', icon: Wallet, color: '#38e07f' },
  { id: 'budgets', label: 'Presupuestos', desc: 'Semanal · quincenal · mesadas', icon: ChartPie, color: '#f5b544' },
  { id: 'debts', label: 'Deudas', desc: 'Por pagar y por cobrar', icon: CreditCard, color: '#f43f5e' },
  { id: 'goals', label: 'Metas de ahorro', desc: 'Indexadas en divisas', icon: Target, color: '#2dd4bf' },
  { id: 'rates', label: 'Tasas y cambios', desc: 'BCV · paralelo · USDT P2P', icon: Coins, color: '#c084fc' },
  { id: 'scanner', label: 'Escanear comprobante', desc: 'OCR con IA', icon: Camera, color: '#fb923c' },
  { id: 'summary', label: 'Resumen IA semanal', desc: 'Análisis de patrones', icon: Sparkles, color: '#a3e635' },
  { id: 'assistant', label: 'Asistente financiero', desc: 'Texto o voz', icon: Bot, color: '#67e8f9' },
  { id: 'settings', label: 'Ajustes', desc: 'Moneda base, datos, PWA', icon: Settings, color: '#94a3b8' },
]

export function MoreView() {
  const { setView } = useAppStore()
  return (
    <div className="pb-4">
      <ViewHeader title="Todos los módulos" subtitle="Todo tu dinero en un solo lugar" />
      <div className="grid grid-cols-2 gap-3">
        {MODULES.map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              onClick={() => setView(m.id as never)}
              className={cn(
                'glass rounded-2xl p-4 text-left active:scale-[0.97] transition-transform hover:border-white/15'
              )}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: `${m.color}1c`, color: m.color }}
              >
                <Icon size={20} />
              </div>
              <p className="text-sm font-semibold leading-tight">{m.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
