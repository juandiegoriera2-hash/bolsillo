import { NextResponse } from 'next/server'
import { PIN_COOKIE, pinEnabled, pinHash } from '@/lib/pin'

/** Desbloquea la app: valida el PIN y planta la cookie de acceso */
export async function POST(req: Request) {
  try {
    if (!pinEnabled()) {
      // sin APP_PIN configurado no hay candado: responder ok
      return NextResponse.json({ ok: true, locked: false })
    }
    const body = (await req.json().catch(() => null)) as { pin?: unknown } | null
    const attempt = String(body?.pin ?? '')
    if (!attempt || attempt !== process.env.APP_PIN) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true, locked: true })
    res.cookies.set(PIN_COOKIE, await pinHash(process.env.APP_PIN!), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 90, // 90 días
      path: '/',
    })
    return res
  } catch (e) {
    console.error('[auth POST]', e)
    return NextResponse.json({ error: 'Error validando el PIN' }, { status: 500 })
  }
}

/** ¿Hay candado configurado? (la UI lo usa para mostrar el candado) */
export async function GET() {
  return NextResponse.json({ locked: pinEnabled() })
}
