// Diagnóstico de configuración (sin filtrar valores sensibles):
// muestra qué variables de entorno detecta la app en producción.
import { NextResponse } from 'next/server'
import { tursoConfig } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const t = tursoConfig()
  return NextResponse.json({
    ok: true,
    modo: t ? 'turso' : 'local',
    env: {
      TURSO_DATABASE_URL: Boolean(process.env.TURSO_DATABASE_URL),
      TURSO_AUTH_TOKEN: Boolean(process.env.TURSO_AUTH_TOKEN),
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      DATABASE_AUTH_TOKEN: Boolean(process.env.DATABASE_AUTH_TOKEN),
      APP_PIN: Boolean(process.env.APP_PIN),
      urlValida: t ? true : false,
    },
  })
}
