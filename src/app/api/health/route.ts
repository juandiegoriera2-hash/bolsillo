// Diagnóstico de configuración y conexión.
//   /api/health        → solo muestra qué variables detecta
//   /api/health?deep=1 → además intenta una consulta real a la BD
import { NextResponse } from 'next/server'
import { tursoConfig, db } from '@/lib/db'
import { ensureSchema } from '@/lib/seed'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const t = tursoConfig()
  const deep = new URL(req.url).searchParams.get('deep') === '1'
  const base = {
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
  }
  if (!deep) return NextResponse.json(base)
  try {
    await ensureSchema()
    const n = await db.appMeta.count()
    return NextResponse.json({ ...base, deep: 'ok', filas: n })
  } catch (e) {
    return NextResponse.json(
      { ...base, deep: 'error', detalle: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
