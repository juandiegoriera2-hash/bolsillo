// ─────────────────────────────────────────────────────────────────
// Bolsillo — Diálogo de importación de estado de cuenta bancario
// El usuario descarga su estado de cuenta (Excel/CSV) desde la banca
// en línea (Mercantil, Banesco, BNC…), elige la cuenta, y la app lee
// fecha, concepto, débitos/créditos y referencias automáticamente.
// ─────────────────────────────────────────────────────────────────
'use client'

import { useMemo, useRef, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { useAppStore } from './store'
import { api } from './api'
import { useToast } from '@/hooks/use-toast'
import { parseBankFile, type ParsedBankRow } from '@/lib/bank-import'
import { formatMoney, type Currency } from '@/lib/finance'
import { cn } from '@/lib/utils'
import { Check, FileSpreadsheet, Landmark, Loader2, Upload } from 'lucide-react'

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { overview, refreshOverview, refreshMeta } = useAppStore()
  const { toast } = useToast()
  const accounts = overview?.accounts ?? []
  const fileRef = useRef<HTMLInputElement>(null)

  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState<ParsedBankRow[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  // cuenta por defecto: primer banco en Bs
  const effectiveAccountId = accountId || (accounts.find((a) => a.currency === 'VES') ?? accounts[0])?.id || ''
  const account = accounts.find((a) => a.id === effectiveAccountId)

  const selected = useMemo(() => rows.filter((r) => !excluded.has(r.id)), [rows, excluded])
  const incomeCount = selected.filter((r) => r.amount > 0).length
  const expenseCount = selected.length - incomeCount

  const reset = () => {
    setRows([])
    setExcluded(new Set())
    setFileName('')
    setError('')
  }

  const onFile = async (file: File) => {
    setParsing(true)
    setError('')
    setRows([])
    try {
      const res = await parseBankFile(file)
      setRows(res.rows)
      setExcluded(new Set())
      setFileName(file.name)
      if (res.rows.length === 0) {
        setError('No pude leer movimientos en ese archivo. Prueba con el Excel o CSV de tu banca en línea.')
      }
    } catch (e) {
      setError((e as Error).message || 'No pude leer el archivo')
    } finally {
      setParsing(false)
    }
  }

  const doImport = async () => {
    if (selected.length === 0 || !effectiveAccountId || importing) return
    setImporting(true)
    try {
      const res = await api.importTransactions({
        accountId: effectiveAccountId,
        items: selected.map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          reference: r.reference || undefined,
        })),
      })
      toast({
        title: `${res.created} movimiento(s) importado(s) ✓`,
        description:
          (res.duplicates > 0 ? `${res.duplicates} ya estaban registrados y los salté. ` : '') +
          `Cuenta: ${account?.name}`,
      })
      onClose()
      reset()
      await Promise.all([refreshOverview(), refreshMeta()])
    } catch (e) {
      toast({ title: 'No pude importar', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const toggleRow = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          reset()
        }
      }}
    >
      <DialogContent className="glass border-white/10 max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark size={17} className="text-emerald-400" />
            Importar estado de cuenta
          </DialogTitle>
          <DialogDescription>
            Descarga tus movimientos desde la web de tu banco (Mercantil, Banesco, BNC…) en{' '}
            <span className="text-foreground/80">Excel o CSV</span> y súbelos aquí: leo la fecha, el
            concepto y los montos solo.
          </DialogDescription>
        </DialogHeader>

        {/* cuenta destino */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Cuenta a la que pertenecen los movimientos
          </label>
          <Select value={effectiveAccountId} onValueChange={setAccountId}>
            <SelectTrigger className="bg-secondary/40 border-white/10">
              <SelectValue placeholder="Cuenta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.type === 'BINANCE' ? '🟡 ' : ''}
                  {a.name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* selector de archivo */}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className={cn(
            'w-full rounded-2xl border border-dashed border-white/20 bg-secondary/30 px-4 py-6 flex flex-col items-center gap-2 transition-colors',
            'hover:border-emerald-400/40 hover:bg-emerald-400/5 disabled:opacity-60'
          )}
        >
          {parsing ? (
            <Loader2 size={22} className="animate-spin text-emerald-400" />
          ) : (
            <Upload size={22} className="text-emerald-400" />
          )}
          <span className="text-sm font-medium">
            {parsing ? 'Leyendo archivo…' : fileName ? 'Elegir otro archivo' : 'Toca para elegir el archivo'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {fileName ? `📄 ${fileName}` : 'Excel (.xlsx / .xls) o CSV / TXT'}
          </span>
        </button>

        {error && (
          <p className="text-xs text-rose-300 bg-rose-400/10 border border-rose-400/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* vista previa */}
        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <p className="font-semibold">
                {selected.length} de {rows.length} movimientos
              </p>
              <p className="text-muted-foreground tnum">
                <span className="text-emerald-400">{incomeCount} ingresos</span> ·{' '}
                <span className="text-rose-400">{expenseCount} gastos</span>
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto pr-1 space-y-1.5 finance-scroll">
              {rows.map((r) => {
                const included = !excluded.has(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRow(r.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
                      included
                        ? 'border-white/10 bg-secondary/40'
                        : 'border-white/5 bg-transparent opacity-45'
                    )}
                  >
                    <span
                      className={cn(
                        'w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0',
                        included ? 'bg-emerald-400 border-emerald-400 text-emerald-950' : 'border-white/25'
                      )}
                    >
                      {included && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium truncate">{r.description}</span>
                      <span className="block text-[10px] text-muted-foreground tnum">
                        {r.date.split('-').reverse().join('/')}
                        {r.reference ? ` · Ref ${r.reference}` : ''}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'tnum text-xs font-semibold shrink-0',
                        r.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {r.amount > 0 ? '+' : '−'}
                      {formatMoney(Math.abs(r.amount), (account?.currency ?? 'VES') as Currency)}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet size={12} />
              Toca un movimiento para excluirlo de la importación
            </p>
          </div>
        )}

        <DialogFooter className="flex-row items-center sm:justify-between">
          <span className="text-[10px] text-muted-foreground">Se marcan como 🏦 Banco importado</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={doImport}
              disabled={selected.length === 0 || !effectiveAccountId || importing}
              className="font-semibold min-w-32"
            >
              {importing ? 'Importando…' : `Importar ${selected.length}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
