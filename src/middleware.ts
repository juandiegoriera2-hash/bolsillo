// ─────────────────────────────────────────────────────────────────
// Bolsillo — Middleware de candado PIN
// Con APP_PIN definido: /api/* responde 401 hasta que el usuario
// introduzca el PIN correcto (cookie firmada con hash). /api/auth
// queda abierto obviamente, y la página en sí no lleva datos.
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { PIN_COOKIE, pinEnabled, pinHash } from '@/lib/pin'

export async function middleware(req: Request) {
  if (!pinEnabled()) return NextResponse.next()

  const { pathname } = new URL(req.url)
  if (pathname === '/api/auth') return NextResponse.next()

  const cookie = req.headers.get('cookie') ?? ''
  const match = new RegExp(`(?:^|;\\s*)${PIN_COOKIE}=([a-f0-9]{64})`).exec(cookie)
  const expected = await pinHash(process.env.APP_PIN!)
  if (match && match[1] === expected) return NextResponse.next()

  return NextResponse.json({ error: 'Bloqueado: ingresa tu PIN' }, { status: 401 })
}

export const config = {
  matcher: '/api/:path*',
}
