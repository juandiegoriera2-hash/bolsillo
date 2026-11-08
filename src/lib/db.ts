// ─────────────────────────────────────────────────────────────────
// Bolsillo — Cliente Prisma (doble modo)
//  · Producción (Vercel + Turso): TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
//    → Prisma con el driver adapter libSQL (base de datos gratuita en la nube)
//  · Desarrollo: SQLite local vía DATABASE_URL (file:…) — sin cambios
// ─────────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'
import { createClient } from '@libsql/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

function createDb(): PrismaClient {
  // Acepta ambos conjuntos de nombres (TURSO_* o DATABASE_*)
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN
  if (url && token && url.startsWith('libsql')) {
    return new PrismaClient({
      adapter: new PrismaLibSQL(createClient({ url, authToken: token })),
      log: ['error'],
    })
  }
  return new PrismaClient({ log: ['error'] })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createDb()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
