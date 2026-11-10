// ─────────────────────────────────────────────────────────────────
// Bolsillo — Cliente Prisma (doble modo)
//  · Producción (Vercel + Turso): TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
//    (también acepta DATABASE_URL + DATABASE_AUTH_TOKEN)
//  · Desarrollo: SQLite local vía DATABASE_URL (file:…)
// La instancia se crea LAZY (en la primera consulta) para que el
// build de Vercel nunca intente conectarse a la base de datos.
// ─────────────────────────────────────────────────────────────────
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

export function tursoConfig(): { url: string; token: string } | null {
  const url =
    process.env.TURSO_DATABASE_URL ||
    (process.env.DATABASE_URL?.startsWith('libsql') ? process.env.DATABASE_URL : undefined)
  const token = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN
  if (url && token && /^libsql:\/\//.test(url) && token !== 'undefined') {
    return { url, token }
  }
  return null
}

function createDb(): PrismaClient {
  const t = tursoConfig()
  if (t) {
    // PrismaLibSQL espera la CONFIGURACIÓN ({url, authToken}),
    // no un cliente ya creado — él crea el cliente internamente.
    return new PrismaClient({
      adapter: new PrismaLibSQL({ url: t.url, authToken: t.token }),
      log: ['error'],
    })
  }
  // Sin DATABASE_URL, usa SQLite local en db/custom.db para que la app
  // arranque sin configuración (antes fallaba con "Environment variable not found").
  const datasourceUrl =
    process.env.DATABASE_URL || `file:${path.join(process.cwd(), 'db', 'custom.db')}`
  return new PrismaClient({ datasourceUrl, log: ['error'] })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Proxy perezoso: la conexión se establece en la primera consulta,
// no al importar el módulo (evita fallos de build en Vercel).
let instance: PrismaClient | undefined
export const db = new Proxy({} as PrismaClient, {
  get(_t, prop, receiver) {
    if (!instance) {
      instance = globalForPrisma.prisma ?? createDb()
      globalForPrisma.prisma = instance
    }
    return Reflect.get(instance, prop, receiver)
  },
})
