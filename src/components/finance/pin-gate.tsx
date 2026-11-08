// ─────────────────────────────────────────────────────────────────
// Bolsillo — Pantalla de candado (PIN)
// Aparece sola cuando la API responde 401 (APP_PIN configurado en
// producción). Al desbloquear, recarga la app para re-sincronizar.
// ─────────────────────────────────────────────────────────────────
'use client'

import { useEffect, useRef, useState } from 'react'
import { Banknote, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const LOCKED_EVENT = 'bolsillo:locked'

export function PinGate() {
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onLocked = () => setLocked(true)
    window.addEventListener(LOCKED_EVENT, onLocked)
    return () => window.removeEventListener(LOCKED_EVENT, onLocked)
  }, [])

  useEffect(() => {
    if (locked) inputRef.current?.focus()
  }, [locked])

  const unlock = async () => {
    const attempt = pin.trim()
    if (!attempt || busy) return
    setBusy(true)
    setError(false)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: attempt }),
      })
      if (res.ok) {
        window.location.reload() // re-sincroniza todo con la cookie nueva
        return
      }
      setError(true)
      setPin('')
      inputRef.current?.focus()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (!locked) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Desbloquear Bolsillo"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[oklch(0.145_0.006_285)]/98 backdrop-blur-md px-4"
    >
      <div className="glass rounded-3xl border border-white/10 p-6 sm:p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-4">
          <Banknote size={26} className="text-emerald-950" strokeWidth={2.4} />
        </div>
        <h1 className="text-lg font-bold mb-1">Bolsillo está bloqueado</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Ingresa tu PIN para ver tus finanzas
        </p>
        <div className="space-y-3">
          <div className="relative">
            <LockKeyhole
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="• • • •"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlock()}
              className="bg-secondary/40 border-white/10 pl-10 h-12 text-center text-lg tracking-[0.5em] tnum"
              maxLength={12}
              aria-label="PIN de acceso"
            />
          </div>
          {error && <p className="text-xs text-rose-400">PIN incorrecto, intenta de nuevo</p>}
          <Button
            onClick={unlock}
            disabled={!pin.trim() || busy}
            className="w-full h-11 font-semibold bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
          >
            {busy ? 'Verificando…' : 'Desbloquear'}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-5">
          🔒 Tus datos están protegidos. Este candado se activó al publicar
          la app con la variable APP_PIN.
        </p>
      </div>
    </div>
  )
}
