// Diagnóstico de configuración y conexión.
//   /api/health            → variables detectadas
//   /api/health?deep=1     → + consulta real a la base de datos
//   /api/health?ai=1       → + prueba real de la IA (chat 1 mensaje)
import { NextResponse } from 'next/server'
import { tursoConfig, db } from '@/lib/db'
import { ensureSchema } from '@/lib/seed'
import { chatText } from '@/lib/ai'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const t = tursoConfig()
  const deep = new URL(req.url).searchParams.get('deep') === '1'
  const ai = new URL(req.url).searchParams.get('ai') === '1'
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
    ai: {
      base: process.env.AI_BASE_URL ?? null,
      model: process.env.AI_MODEL ?? null,
      keyPrefix: process.env.AI_API_KEY ? process.env.AI_API_KEY.slice(0, 8) : null,
      keyLen: process.env.AI_API_KEY?.length ?? 0,
      voice: process.env.VOICE_API_KEY ? true : false,
    },
  }
  if (deep) {
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
  if (ai) {
    const t0 = Date.now()
    try {
      const reply = await chatText([{ role: 'user', content: 'Di solo: OK' }])
      return NextResponse.json({ ...base, ai_test: { ok: true, ms: Date.now() - t0, sample: reply.slice(0, 60) } })
    } catch (e) {
      return NextResponse.json(
        {
          ...base,
          ai_test: { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) },
        },
        { status: 500 },
      )
    }
  }
  return NextResponse.json(base)
}
