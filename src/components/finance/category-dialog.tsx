// ─────────────────────────────────────────────────────────────────
// Bolsillo — Diálogo de categoría personalizada (nombre, tipo,
// ícono y color). Lo usan Ajustes y el diálogo de movimiento.
// ─────────────────────────────────────────────────────────────────
'use client'

import { useState } from 'react'
import { api } from './api'
import { ICONS } from './parts'
import { useAppStore } from './store'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Category } from './types'

const COLORS = ['#38e07f', '#f5b544', '#f43f5e', '#a78bfa', '#2dd4bf', '#fb923c', '#f472b6', '#94a3b8']
const ICON_KEYS = Object.keys(ICONS)

export function CategoryDialog({
  open,
  defaultKind = 'EXPENSE',
  onClose,
  onCreated,
}: {
  open: boolean
  defaultKind?: 'EXPENSE' | 'INCOME'
  onClose: () => void
  onCreated?: (c: Category) => void
}) {
  const { refreshMeta } = useAppStore()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>(defaultKind)
  const [icon, setIcon] = useState('circle-dashed')
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState('')

  // reiniciar estado al abrir (patrón del resto de diálogos)
  const openKey = `${open}-${defaultKind}`
  if (open && key !== openKey) {
    setKey(openKey)
    setName('')
    setKind(defaultKind)
    setIcon(defaultKind === 'INCOME' ? 'briefcase' : 'circle-dashed')
    setColor(defaultKind === 'INCOME' ? '#2dd4bf' : '#38e07f')
  }

  const submit = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const created = await api.createCategory({ name: name.trim(), kind, icon, color })
      await refreshMeta()
      toast({ title: 'Categoría creada ✓', description: created.name })
      onCreated?.(created)
      onClose()
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
          <DialogTitle>Nueva categoría</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              placeholder="Ej: Mascotas, Gimnasio, Remesas…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className="bg-secondary/40 border-white/10"
              autoFocus
            />
          </div>

          <div>
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'EXPENSE', label: 'Gasto', hint: 'salidas de dinero' },
                  { id: 'INCOME', label: 'Ingreso', hint: 'entradas de dinero' },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={cn(
                    'rounded-xl border p-2.5 text-left transition-all',
                    kind === k.id ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-secondary/40'
                  )}
                >
                  <p className="text-xs font-semibold">{k.label}</p>
                  <p className="text-[10px] text-muted-foreground">{k.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Ícono</Label>
            <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIcon(k)}
                  aria-label={`Ícono ${k}`}
                  className={cn(
                    'aspect-square rounded-lg flex items-center justify-center border transition-all',
                    icon === k ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/10 bg-secondary/40'
                  )}
                  style={{ color: icon === k ? color : undefined }}
                >
                  {(() => {
                    const Ico = ICONS[k]
                    return <Ico size={16} strokeWidth={2.1} />
                  })()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-transform',
                    color === c ? 'border-white scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Las categorías personalizadas se pueden eliminar mientras ningún movimiento las use.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || saving}
            className="font-semibold bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
          >
            {saving ? 'Creando…' : 'Crear categoría'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
