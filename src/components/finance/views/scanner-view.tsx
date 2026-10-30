'use client'

import { useRef, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import { ViewHeader } from '../parts'
import { formatMoney, CURRENCY_META, type Currency } from '@/lib/finance'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertTriangle, Camera, Check, ImageIcon, Loader2, RefreshCw, ScanLine, Sparkles, Upload } from 'lucide-react'
import type { OcrPayload } from '../types'

const SUPPORTED = 'Pago Móvil · Transferencias (Mercantil, Banesco, BDV, BNC, Provincial) · Binance P2P · Zinli · Zelle'

export function ScannerView() {
  const { overview, openTxDialog, refreshMeta } = useAppStore()
  const { toast } = useToast()
  const [image, setImage] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<OcrPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const accounts = overview?.accounts ?? []

  const loadFile = (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Ese archivo no es una imagen')
      return
    }
    setResult(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  // pegar desde el portapapeles (Ctrl+V)
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    if (item) loadFile(item.getAsFile())
  }

  const analyze = async () => {
    if (!image || analyzing) return
    setAnalyzing(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.ocr(image)
      setResult(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  const confirm = (type: 'EXPENSE' | 'INCOME') => {
    if (!result) return
    const currency = (result.moneda === 'USD' ? 'USD' : result.moneda === 'EUR' ? 'EUR' : result.moneda === 'USDT' ? 'USDT' : 'VES') as Currency
    const account =
      accounts.find((a) => a.currency === currency) ??
      accounts.find((a) => a.currency === 'VES') ??
      accounts[0]
    const desc = [result.persona, result.tipoOperacion].filter(Boolean).join(' · ') || 'Comprobante'
    openTxDialog({
      prefill: {
        type,
        amount: result.monto ?? 0,
        currency,
        accountId: account?.id,
        description: desc,
        reference: result.referencia ?? undefined,
        date: result.fecha ? `${result.fecha}T12:00:00` : undefined,
        tagIds: [],
      },
    })
    toast({
      title: 'Datos extraídos con IA ✓',
      description: 'Confirma la categoría y guarda',
    })
  }

  return (
    <div className="pb-4" onPaste={onPaste}>
      <ViewHeader
        title="Escanear comprobante"
        subtitle={`Sube o pega una captura y la IA extrae monto, fecha y referencia · ${SUPPORTED}`}
      />

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => loadFile(e.target.files?.[0])} />

      {/* zona de carga */}
      {!image && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            loadFile(e.dataTransfer.files?.[0])
          }}
          className="glass rounded-3xl border-dashed! border-white/15! p-10 flex flex-col items-center text-center cursor-pointer hover:border-emerald-400/40 transition-colors"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 to-teal-400/20 flex items-center justify-center mb-4">
            <ScanLine size={30} className="text-amber-300" />
          </div>
          <p className="font-semibold">Arrastra, pega (Ctrl+V) o toca para subir</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
            Capturas de pantalla de Pago Móvil, transferencias bancarias, Binance o Zinli. JPG, PNG o WebP.
          </p>
          <div className="flex gap-2 mt-5">
            <Button variant="outline" className="border-white/10 bg-secondary/40" onClick={(e) => { e.stopPropagation(); cameraRef.current?.click() }}>
              <Camera size={15} className="mr-1.5" /> Cámara
            </Button>
            <Button variant="outline" className="border-white/10 bg-secondary/40" onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}>
              <Upload size={15} className="mr-1.5" /> Galería
            </Button>
          </div>
        </div>
      )}

      {/* preview */}
      {image && (
        <div className="glass rounded-3xl p-4">
          <div className="relative rounded-2xl overflow-hidden bg-black/30">
            <img src={image} alt="Comprobante subido" className="w-full max-h-80 object-contain" />
            <button
              onClick={() => {
                setImage(null)
                setResult(null)
                setError(null)
              }}
              className="absolute top-2 right-2 glass rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              Cambiar
            </button>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              onClick={analyze}
              disabled={analyzing}
              className="flex-1 bg-gradient-to-r from-amber-400 to-orange-400 text-amber-950 hover:opacity-90 font-semibold h-11"
            >
              {analyzing ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Leyendo comprobante con IA…
                </>
              ) : (
                <>
                  <Sparkles size={16} className="mr-2" /> Analizar con IA
                </>
              )}
            </Button>
            <Button variant="outline" className="border-white/10 bg-secondary/40" onClick={() => cameraRef.current?.click()} aria-label="Otra captura">
              <Camera size={16} />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 glass rounded-2xl p-4 flex items-start gap-3 border-rose-400/20">
          <AlertTriangle size={18} className="text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-rose-300">No pude leer el comprobante</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            <Button variant="outline" size="sm" className="mt-2.5 border-white/10 bg-secondary/40" onClick={analyze}>
              <RefreshCw size={13} className="mr-1.5" /> Reintentar
            </Button>
          </div>
        </div>
      )}

      {/* resultado */}
      {result && (
        <div className="mt-4 glass rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-xl bg-emerald-400/12 text-emerald-400 flex items-center justify-center">
              <Check size={17} />
            </span>
            <div>
              <p className="font-semibold text-sm">Datos extraídos</p>
              <p className="text-[11px] text-muted-foreground">Revisa, confirma la categoría y guarda</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-sm">
            <Field label="Monto" highlight>
              {result.monto != null ? formatMoney(result.monto, (result.moneda ?? 'VES') as Currency) : '—'}
            </Field>
            <Field label="Operación">{result.tipoOperacion ?? '—'}</Field>
            <Field label="Banco / plataforma">{result.banco ?? '—'}</Field>
            <Field label="Fecha">{result.fecha ?? '—'}</Field>
            <Field label="Referencia">{result.referencia ?? '—'}</Field>
            <Field label="Persona">{result.persona ?? '—'}</Field>
          </div>

          {result.notas && (
            <p className="text-xs text-amber-300/90 bg-amber-400/5 border border-amber-400/15 rounded-xl px-3 py-2 mt-3">
              ⚠️ {result.notas}
            </p>
          )}

          {result.monto != null && result.monto > 0 ? (
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Button
                onClick={() => confirm('EXPENSE')}
                className="h-11 bg-rose-400 text-rose-950 hover:bg-rose-300 font-semibold"
              >
                Registrar como gasto
              </Button>
              <Button
                onClick={() => confirm('INCOME')}
                className="h-11 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-semibold"
              >
                Registrar como ingreso
              </Button>
            </div>
          ) : (
            <p className="text-xs text-rose-400 mt-3">
              No detecté un monto legible. Prueba con una captura más nítida o regístralo manualmente.
            </p>
          )}

          <p className="text-[10px] text-muted-foreground text-center mt-3">
            Cuenta sugerida:{' '}
            {(() => {
              const cur = (result.moneda === 'USD' ? 'USD' : result.moneda === 'EUR' ? 'EUR' : result.moneda === 'USDT' ? 'USDT' : 'VES') as Currency
              const acc = accounts.find((a) => a.currency === cur) ?? accounts.find((a) => a.currency === 'VES')
              return acc ? `${acc.name} (${CURRENCY_META[cur].short})` : 'ninguna'
            })()}
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center mt-5 px-6">
        <ImageIcon size={12} className="inline mr-1 -mt-0.5" />
        Tus imágenes se procesan con IA de visión y no se almacenan en el servidor.
      </p>
    </div>
  )
}

function Field({ label, children, highlight = false }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl px-3.5 py-2.5 bg-secondary/40', highlight && 'bg-emerald-400/10')}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={cn('font-medium tnum mt-0.5', highlight && 'text-emerald-300 font-bold text-lg')}>{children}</p>
    </div>
  )
}
