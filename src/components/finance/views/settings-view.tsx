'use client'

import { useState } from 'react'
import { useAppStore } from '../store'
import { api } from '../api'
import { ViewHeader, CatIcon, ICONS } from '../parts'
import { CategoryDialog } from '../category-dialog'
import type { Category } from '../types'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowDownToLine, Banknote, Database, Download, Plus, Shapes, Smartphone, Tags, Trash2 } from 'lucide-react'

export function SettingsView() {
  const { overview, refreshOverview, refreshMeta, categories, tags, canInstall, installEvent } = useAppStore()
  const { toast } = useToast()
  const [baseCurrency, setBaseCurrency] = useState(overview?.settings.baseCurrency ?? 'VES')
  const [valuationSource, setValuationSource] = useState(overview?.settings.valuationSource ?? 'PARALELO')
  const [newTag, setNewTag] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const [wiping, setWiping] = useState(false)

  const saveSettings = async (data: { baseCurrency?: string; valuationSource?: string }) => {
    try {
      const res = await api.saveSettings(data)
      if (data.baseCurrency) setBaseCurrency(res.baseCurrency)
      if (data.valuationSource) setValuationSource(res.valuationSource)
      await refreshOverview()
      toast({ title: 'Ajustes guardados ✓' })
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const install = async () => {
    if (!installEvent) return
    try {
      await (installEvent as unknown as { prompt: () => Promise<void> }).prompt()
      useAppStore.getState().setInstallEvent(null)
    } catch {
      toast({ title: 'No se pudo iniciar la instalación' })
    }
  }

  const addTag = async () => {
    if (!newTag.trim()) return
    try {
      await api.createTag({ name: newTag.trim(), color: '#a78bfa' })
      setNewTag('')
      await refreshMeta()
      toast({ title: 'Etiqueta creada ✓' })
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const delTag = async (id: string) => {
    try {
      await api.deleteTag(id)
      await refreshMeta()
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const delCategory = async (c: Category) => {
    if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return
    try {
      await api.deleteCategory(c.id)
      await refreshMeta()
      toast({ title: 'Categoría eliminada' })
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const wipe = async (mode: 'all' | 'demo') => {
    setWiping(true)
    try {
      await api.wipeData(mode)
      await Promise.all([refreshOverview(), refreshMeta()])
      toast({
        title: mode === 'demo' ? 'Datos demo restaurados ✓' : 'Todos los datos fueron borrados',
      })
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="pb-4">
      <ViewHeader title="Ajustes" subtitle="Personaliza cómo Bolsillo calcula y muestra tu dinero" />

      {/* preferencias */}
      <section className="glass rounded-2xl p-5 mb-4">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Banknote size={15} className="text-emerald-400" /> Preferencias de patrimonio
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Cómo se calcula tu patrimonio total y a qué tasa se convierten los bolívares.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Moneda principal</label>
            <Select value={baseCurrency} onValueChange={(v) => saveSettings({ baseCurrency: v })}>
              <SelectTrigger className="bg-secondary/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">Dólares (indexado)</SelectItem>
                <SelectItem value="VES">Bolívares</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Tasa para valorar Bs</label>
            <Select value={valuationSource} onValueChange={(v) => saveSettings({ valuationSource: v })}>
              <SelectTrigger className="bg-secondary/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PARALELO">Paralelo (real de mercado)</SelectItem>
                <SelectItem value="BCV">BCV oficial</SelectItem>
                <SelectItem value="USDT_P2P">USDT P2P (Binance)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* PWA */}
      <section className="glass rounded-2xl p-5 mb-4">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <ArrowDownToLine size={15} className="text-teal-300" /> Instalar aplicación
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Instala Bolsillo como app: acceso directo, pantalla completa y funciona mejor offline.
        </p>
        {canInstall ? (
          <Button onClick={install} className="bg-teal-400 text-teal-950 hover:bg-teal-300 font-semibold">
            <Download size={15} className="mr-1.5" /> Instalar ahora
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground bg-secondary/40 rounded-xl px-3.5 py-2.5">
            📱 En tu celular: menú del navegador → <strong>“Agregar a pantalla de inicio”</strong>. En computadora: ícono
            de instalación en la barra de direcciones.
          </p>
        )}
      </section>

      {/* etiquetas */}
      <section className="glass rounded-2xl p-5 mb-4">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Tags size={15} className="text-violet-300" /> Etiquetas personalizadas
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Úsalas para filtrar movimientos y crear presupuestos quirúrgicos (ej. gastos hormiga 🐜).
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium group"
              style={{ backgroundColor: `${t.color}1c`, color: t.color }}
            >
              {t.name}
              <button onClick={() => delTag(t.id)} className="opacity-50 hover:opacity-100" aria-label={`Eliminar ${t.name}`}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-xs text-muted-foreground">Sin etiquetas aún.</p>}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Nueva etiqueta…"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            className="bg-secondary/40 border-white/10 h-9"
          />
          <Button size="sm" variant="outline" className="border-white/10 bg-secondary/40 h-9" onClick={addTag}>
            <Plus size={14} className="mr-1" /> Crear
          </Button>
        </div>
      </section>

      {/* categorías */}
      <section className="glass rounded-2xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
              <Shapes size={15} className="text-emerald-400" /> Categorías
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Crea categorías propias con ícono y color. Las predeterminadas no se pueden borrar.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setCatOpen(true)}
            className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold h-8 shrink-0"
          >
            <Plus size={14} className="mr-1" /> Nueva
          </Button>
        </div>

        {(['EXPENSE', 'INCOME'] as const).map((kind) => {
          const list = categories.filter((c) => c.kind === kind)
          if (list.length === 0) return null
          return (
            <div key={kind} className={kind === 'EXPENSE' ? 'mt-4' : 'mt-4 pt-4 border-t border-white/5'}>
              <p className="text-[11px] text-muted-foreground mb-2">
                {kind === 'EXPENSE' ? 'Gastos' : 'Ingresos'} · {list.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((c) => {
                  const Ico = ICONS[c.icon]
                  return (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${c.color}1c`, color: c.color }}
                      title={c.isDefault ? 'Categoría predeterminada' : 'Categoría personalizada'}
                    >
                      {Ico ? <Ico size={12} /> : <CatIcon icon={c.icon} color={c.color} size={8} />}
                      {c.name}
                      {!c.isDefault && (
                        <button
                          onClick={() => delCategory(c)}
                          className="opacity-50 hover:opacity-100"
                          aria-label={`Eliminar ${c.name}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* datos */}
      <section className="glass rounded-2xl p-5 mb-4">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Database size={15} className="text-amber-400" /> Datos
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Los datos se guardan en la base de datos de la app — aquí en este entorno y, si la publicas, en tu propia base Turso. Nadie más ve tus finanzas.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-amber-400/30 text-amber-300 hover:bg-amber-400/10 h-9 text-xs">
                ♻️ Restaurar datos demo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="glass border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Restaurar datos demo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán tus datos actuales y se cargarán cuentas, movimientos, deudas y metas de ejemplo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => wipe('demo')} className="bg-amber-400 text-amber-950 hover:bg-amber-300">
                  Restaurar demo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-rose-400/30 text-rose-300 hover:bg-rose-400/10 h-9 text-xs">
                <Trash2 size={13} className="mr-1" /> Borrar todo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="glass border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Borrar todos los datos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminarán cuentas, movimientos, presupuestos, deudas, metas e historial de tasas. Esta acción no
                  se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => wipe('all')} className="bg-rose-500 text-white hover:bg-rose-400">
                  Sí, borrar todo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      {/* instalar en el teléfono */}
      <section className="glass rounded-2xl p-5 mb-4">
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
          <Smartphone size={15} className="text-emerald-400" /> Instalar en tu teléfono
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
          Esta vista previa es temporal. Para usar Bolsillo a diario, publícala gratis con la guía incluida en el ZIP (DEPLOY.md, ~20 min, sin tarjeta).
        </p>
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          {([
            ['GitHub', 'Código'],
            ['Turso', 'Datos'],
            ['Vercel', 'App'],
          ] as const).map(([name, desc]) => (
            <div key={name} className="rounded-xl bg-secondary/60 py-2">
              <p className="text-[11px] font-semibold">{name}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
        <Button
          asChild
          className="w-full h-10 bg-gradient-to-r from-emerald-400 to-teal-500 text-emerald-950 hover:from-emerald-300 hover:to-teal-400 font-semibold"
        >
          <a href="/bolsillo-source.zip" download="bolsillo-source.zip">
            <Download size={16} className="mr-2" /> Descargar código (bolsillo-source.zip)
          </a>
        </Button>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Luego: Safari → Compartir → “Agregar a pantalla de inicio”
        </p>
      </section>

      <CategoryDialog open={catOpen} onClose={() => setCatOpen(false)} />

      {/* acerca de */}
      <section className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
            <Banknote size={20} className="text-emerald-950" />
          </div>
          <div>
            <p className="font-bold">Bolsillo</p>
            <p className="text-[11px] text-muted-foreground">Finanzas personales para Venezuela · v1.0</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <p>💱 Tasas: dolarapi (BCV/paralelo) + Binance P2P</p>
          <p>🤖 IA: chat, voz y OCR de comprobantes</p>
          <p>🔒 Candado PIN al publicar</p>
          <p>📱 PWA instalable</p>
        </div>
      </section>
    </div>
  )
}
