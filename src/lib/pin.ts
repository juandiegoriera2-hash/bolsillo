// ─────────────────────────────────────────────────────────────────
// Bolsillo — Candado de acceso (PIN)
// Si defines APP_PIN en las variables de entorno, TODA la API queda
// bloqueada hasta introducir el PIN. Sin APP_PIN, la app queda abierta
// (modo local / desarrollo). El shell de la página no contiene datos
// sensibles: todo llega por /api/*, que es lo que protege el middleware.
// ─────────────────────────────────────────────────────────────────

export const PIN_COOKIE = 'bolsillo_unlock'

/** hex(sha256(s)) — funciona en Edge (middleware) y Node (rutas API) */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Valor esperado de la cookie de desbloqueo para un PIN dado */
export function pinHash(pin: string): Promise<string> {
  return sha256Hex(`bolsillo:${pin}`)
}

/** ¿El candado está activo en este entorno? */
export function pinEnabled(): boolean {
  return Boolean(process.env.APP_PIN && process.env.APP_PIN.length > 0)
}
