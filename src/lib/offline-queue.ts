// ─────────────────────────────────────────────────────────────────
// Bolsillo — Cola offline
// Los movimientos creados sin conexión se guardan en el teléfono
// (localStorage) y se envían a la base de datos al recuperar internet.
// Eventos:
//  · 'bolsillo:queued'   → se encoló un nuevo elemento
//  · 'bolsillo:synced'   → la cola se vació (datos enviados)
//  · 'bolsillo:syncfail' → hubo conexión pero el servidor no respondió
// ─────────────────────────────────────────────────────────────────
'use client'

export type QueuedItem = {
  id: string
  url: string
  method: string
  body: string
  label: string
  ts: number
}

const KEY = 'bolsillo.queue.v1'

function read(): QueuedItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedItem[]
  } catch {
    return []
  }
}

function write(items: QueuedItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* almacenamiento lleno: ignorar */
  }
}

export function queueLength(): number {
  return read().length
}

/** Toda la cola (para mostrarla en la UI) */
export function readQueue(): QueuedItem[] {
  return read()
}

/** Elimina un elemento concreto de la cola (el usuario lo descarta) */
export function removeQueued(id: string) {
  write(read().filter((it) => it.id !== id))
  window.dispatchEvent(new CustomEvent('bolsillo:queued'))
}

/** Resumen legible de un elemento en cola (ej: "Gasto Bs 4.500 · almuerzo") */
export function queuedSummary(item: QueuedItem): string {
  try {
    const b = JSON.parse(item.body) as Record<string, unknown>
    const parts: string[] = []
    const kind =
      b.type === 'INCOME' ? 'Ingreso' : b.type === 'TRANSFER' ? 'Transferencia' : 'Gasto'
    parts.push(kind)
    if (typeof b.amount === 'number' && Number.isFinite(b.amount)) {
      const cur = String(b.currency ?? '')
      parts.push(`${cur === 'VES' ? 'Bs' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'USDT' ? '₮' : ''}${b.amount.toLocaleString('es-VE')}`.trim())
    }
    if (typeof b.description === 'string' && b.description) parts.push(b.description)
    return parts.join(' · ')
  } catch {
    return item.label
  }
}

export function enqueue(item: Omit<QueuedItem, 'id' | 'ts'>): QueuedItem {
  const full: QueuedItem = {
    ...item,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
  }
  write([...read(), full])
  window.dispatchEvent(new CustomEvent('bolsillo:queued'))
  return full
}

let flushing = false

/** Envía todo lo pendiente. Devuelve cuántos se enviaron con éxito. */
export async function flushQueue(): Promise<number> {
  if (flushing || typeof window === 'undefined') return 0
  flushing = true
  try {
    let sent = 0
    // reintenta hasta vaciar o toparse con errores permanentes
    for (let round = 0; round < 3; round++) {
      const items = read()
      if (items.length === 0) break
      const remaining: QueuedItem[] = []
      for (const it of items) {
        try {
          const res = await fetch(it.url, {
            method: it.method,
            headers: { 'Content-Type': 'application/json' },
            body: it.body,
          })
          if (res.ok || res.status === 400 || res.status === 404 || res.status === 409) {
            // 2xx: enviado · 4xx: el servidor lo rechaza (ya no es válido) — descartar
            if (res.ok) sent++
          } else if (res.status === 401) {
            remaining.push(it) // candado PIN: reintentar cuando se desbloquee
          } else {
            remaining.push(it) // 5xx / red: reintentar luego
          }
        } catch {
          remaining.push(it) // red caída de nuevo
        }
      }
      write(remaining)
      if (remaining.length === items.length) break // nada avanzó
    }
    if (sent > 0) window.dispatchEvent(new CustomEvent('bolsillo:synced'))
    // la cola sigue llena pese a haber red: avisar para reintentar luego
    if (sent === 0 && read().length > 0) window.dispatchEvent(new CustomEvent('bolsillo:syncfail'))
    return sent
  } finally {
    flushing = false
  }
}

/** ¿Hay elementos en cola? (para mostrar en la UI) */
export function hasPending(): boolean {
  return read().length > 0
}
