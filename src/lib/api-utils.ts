// ─────────────────────────────────────────────────────────────────
// Bolsillo — utilidades para rutas API
// ─────────────────────────────────────────────────────────────────

/**
 * P2025 = el registro ya no existe en la BD.
 * Usado para tratar los DELETE como idempotentes: si el usuario borra
 * algo que ya fue borrado (doble clic, reintento, lista desactualizada),
 * respondemos ok en lugar de un 500 confuso.
 */
export function isRecordMissing(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'P2025'
  )
}
