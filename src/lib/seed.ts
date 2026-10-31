// ─────────────────────────────────────────────────────────────────
// Bolsillo — Seed inicial: catálogos + datos demo + historial tasas
// Solo se ejecuta la primera vez (flag en AppMeta). Borrable desde
// Ajustes → Datos.
// ─────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { caracasDateKey } from '@/lib/finance'

let seedPromise: Promise<void> | null = null

export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((e) => {
      seedPromise = null
      throw e
    })
  }
  return seedPromise
}

/** RNG determinista (mulberry32) para datos demo reproducibles */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const daysAgo = (n: number, hour = 12): Date => {
  const d = new Date(Date.now() - n * 86400000)
  d.setHours(hour, (n * 7) % 60, 0, 0)
  return d
}

async function runSeed(): Promise<void> {
  const existing = await db.appMeta.findUnique({ where: { key: 'seeded' } })
  if (existing) return

  // claim atómico: si otra petición ya sembró, unique constraint nos detiene
  try {
    await db.appMeta.create({ data: { key: 'seeded', value: 'in-progress' } })
  } catch {
    return
  }

  try {
    const rand = rng(20261030)

    // ── Config por defecto ─────────────────────────────────────
    await db.appMeta.create({ data: { key: 'baseCurrency', value: 'VES' } })
    await db.appMeta.create({ data: { key: 'valuationSource', value: 'PARALELO' } })

    // ── Categorías ─────────────────────────────────────────────
    const catDefs = [
      { name: 'Comida y bebidas', kind: 'EXPENSE', icon: 'utensils', color: '#f5b544' },
      { name: 'Café y snacks', kind: 'EXPENSE', icon: 'coffee', color: '#e879f9' },
      { name: 'Transporte', kind: 'EXPENSE', icon: 'car', color: '#2dd4bf' },
      { name: 'Hogar', kind: 'EXPENSE', icon: 'home', color: '#c084fc' },
      { name: 'Servicios', kind: 'EXPENSE', icon: 'lightbulb', color: '#fb7185' },
      { name: 'Salud', kind: 'EXPENSE', icon: 'heart-pulse', color: '#f472b6' },
      { name: 'Educación', kind: 'EXPENSE', icon: 'graduation-cap', color: '#a3e635' },
      { name: 'Entretenimiento', kind: 'EXPENSE', icon: 'clapperboard', color: '#fb923c' },
      { name: 'Compras', kind: 'EXPENSE', icon: 'shopping-bag', color: '#fbbf24' },
      { name: 'Familia', kind: 'EXPENSE', icon: 'users', color: '#34d399' },
      { name: 'Otros gastos', kind: 'EXPENSE', icon: 'circle-dashed', color: '#94a3b8' },
      { name: 'Salario', kind: 'INCOME', icon: 'briefcase', color: '#38e07f' },
      { name: 'Freelance', kind: 'INCOME', icon: 'laptop', color: '#4ade80' },
      { name: 'Ventas', kind: 'INCOME', icon: 'trending-up', color: '#a3e635' },
      { name: 'Regalos y remesas', kind: 'INCOME', icon: 'gift', color: '#2dd4bf' },
    ]
    const cats: Record<string, string> = {}
    for (const c of catDefs) {
      const created = await db.category.create({ data: { ...c, isDefault: true } })
      cats[c.name] = created.id
    }

    // ── Etiquetas ──────────────────────────────────────────────
    const tagDefs = [
      { name: 'gasto hormiga', color: '#fb7185' },
      { name: 'esencial', color: '#38e07f' },
      { name: 'suscripción', color: '#c084fc' },
      { name: 'lujo', color: '#f5b544' },
    ]
    const tags: Record<string, string> = {}
    for (const t of tagDefs) {
      const created = await db.tag.create({ data: t })
      tags[t.name] = created.id
    }

    // ── Cuentas ────────────────────────────────────────────────
    const accDefs = [
      { name: 'Banco Banesco', type: 'BANK', currency: 'VES', initialBalance: 180000, color: '#f43f5e', icon: 'landmark' },
      { name: 'Banco Mercantil', type: 'BANK', currency: 'VES', initialBalance: 95000, color: '#f5b544', icon: 'landmark' },
      { name: 'Efectivo Bs', type: 'CASH', currency: 'VES', initialBalance: 200000, color: '#fb923c', icon: 'banknote' },
      { name: 'Efectivo $', type: 'CASH', currency: 'USD', initialBalance: 320, color: '#38e07f', icon: 'dollar-sign' },
      { name: 'Binance USDT', type: 'CRYPTO', currency: 'USDT', initialBalance: 150, color: '#2dd4bf', icon: 'bitcoin' },
      { name: 'Zinli', type: 'WALLET', currency: 'USD', initialBalance: 85, color: '#a3e635', icon: 'wallet' },
      { name: 'Efectivo €', type: 'CASH', currency: 'EUR', initialBalance: 120, color: '#c084fc', icon: 'coins' },
    ]
    const accs: Record<string, string> = {}
    for (const a of accDefs) {
      const created = await db.account.create({ data: a })
      accs[a.name] = created.id
    }

    // ── Historial de tasas (30 días, geometría + ruido determinista) ──
    const BCV_TODAY = 889.2553
    const BCV_30 = 836.0
    const PAR_TODAY = 993.1188
    const PAR_30 = 928.0
    const USDT_TODAY = 1002.0
    const USDT_30 = 938.0
    const EUR_USD = 1.16

    const geo = (from: number, to: number, i: number, n: number) =>
      from * Math.pow(to / from, i / n)
    const noise = (amp: number) => 1 + (rand() - 0.5) * amp

    const rateByDay: number[] = [] // paralelo por día (para rateVesUsd)
    for (let i = 30; i >= 0; i--) {
      const t = 30 - i // 0 = hace 30 días … 30 = hoy
      const bcv = i === 0 ? BCV_TODAY : geo(BCV_30, BCV_TODAY, t, 30) * noise(0.002)
      const par = i === 0 ? PAR_TODAY : geo(PAR_30, PAR_TODAY, t, 30) * noise(0.006)
      const usdt = i === 0 ? USDT_TODAY : geo(USDT_30, USDT_TODAY, t, 30) * noise(0.006)
      const dateKey = caracasDateKey(daysAgo(i))
      for (const [source, usd] of [
        ['BCV', bcv],
        ['PARALELO', par],
        ['USDT_P2P', usdt],
      ] as const) {
        await db.exchangeRate.upsert({
          where: { dateKey_source: { dateKey, source } },
          update: {},
          create: { dateKey, source, usd, eur: usd * EUR_USD },
        })
      }
      rateByDay[i] = par
    }
    const parAt = (n: number) => rateByDay[Math.min(30, Math.max(0, n))]

    // ── Transacciones ──────────────────────────────────────────
    type TxIn = {
      type: 'EXPENSE' | 'INCOME' | 'TRANSFER'
      amount: number
      accountId: string
      toAccountId?: string
      categoryId?: string
      description?: string
      tagIds?: string[]
      date: Date
      reference?: string
    }
    const txs: TxIn[] = []
    const push = (t: TxIn) => txs.push(t)

    // Ingresos fijos
    const salaryDays: Array<[number, number]> = [
      [42, 145000],
      [27, 150000],
      [12, 155000],
      [1, 160000],
    ]
    for (const [d, amount] of salaryDays) {
      push({
        type: 'INCOME',
        amount,
        accountId: accs['Banco Banesco'],
        categoryId: cats['Salario'],
        description: 'Quincena',
        date: daysAgo(d, 8),
      })
    }
    const freelance: Array<[number, number]> = [
      [38, 80],
      [25, 95],
      [11, 70],
      [3, 120],
    ]
    for (const [d, amount] of freelance) {
      push({
        type: 'INCOME',
        amount,
        accountId: accs['Zinli'],
        categoryId: cats['Freelance'],
        description: 'Freelance diseño web',
        date: daysAgo(d, 15),
      })
    }
    for (const [d, amount] of [
      [40, 50],
      [10, 50],
    ] as Array<[number, number]>) {
      push({
        type: 'INCOME',
        amount,
        accountId: accs['Zinli'],
        categoryId: cats['Regalos y remesas'],
        description: 'Remesa familiar',
        date: daysAgo(d, 11),
      })
    }
    for (const [d, amount] of [
      [35, 32],
      [20, 28],
      [6, 40],
    ] as Array<[number, number]>) {
      push({
        type: 'INCOME',
        amount,
        accountId: accs['Efectivo $'],
        categoryId: cats['Ventas'],
        description: 'Venta de artículos',
        date: daysAgo(d, 17),
      })
    }

    // Gastos recurrentes fijos
    const fixed: Array<[number, number, string, string, string, string[] | undefined]> = [
      [20, 9500, 'Internet ABA', 'Banco Banesco', 'Servicios', ['esencial']],
      [33, 1200, 'Electricidad', 'Banco Banesco', 'Servicios', ['esencial']],
      [3, 1200, 'Electricidad', 'Banco Banesco', 'Servicios', ['esencial']],
      [8, 8.99, 'Netflix', 'Zinli', 'Entretenimiento', ['suscripción']],
      [5, 5.99, 'Spotify', 'Zinli', 'Entretenimiento', ['suscripción']],
      [36, 14500, 'Farmacia', 'Banco Mercantil', 'Salud', ['esencial']],
      [16, 9000, 'Consulta médica', 'Banco Mercantil', 'Salud', ['esencial']],
      [1, 11500, 'Farmacia', 'Banco Mercantil', 'Salud', ['esencial']],
      [28, 45, 'Ropa', 'Efectivo $', 'Compras', ['lujo']],
      [9, 30, 'Zapatos', 'Efectivo $', 'Compras', undefined],
      [24, 15, 'Curso online', 'Zinli', 'Educación', undefined],
    ]
    for (const [d, amount, desc, acc, cat, tagNames] of fixed) {
      push({
        type: 'EXPENSE',
        amount,
        accountId: accs[acc],
        categoryId: cats[cat],
        description: desc,
        tagIds: tagNames?.map((t) => tags[t]),
        date: daysAgo(d, 10),
      })
    }

    // Gastos variables por plantilla
    type Tpl = {
      desc: string
      cat: string
      acc: string
      min: number
      max: number
      freq: number
      offset: number
      tags?: string[]
      doubleChance?: number
    }
    const tpls: Tpl[] = [
      { desc: 'Mercado', cat: 'Comida y bebidas', acc: 'Banco Banesco', min: 22000, max: 38000, freq: 7, offset: 0, tags: ['esencial'] },
      { desc: 'Almuerzo', cat: 'Comida y bebidas', acc: 'Efectivo Bs', min: 3500, max: 5500, freq: 2, offset: 0, tags: ['gasto hormiga'] },
      { desc: 'Café', cat: 'Café y snacks', acc: 'Efectivo Bs', min: 1200, max: 2200, freq: 2, offset: 1, tags: ['gasto hormiga'] },
      { desc: 'Taxi', cat: 'Transporte', acc: 'Efectivo Bs', min: 2500, max: 5000, freq: 2, offset: 0 },
      { desc: 'Gasolina', cat: 'Transporte', acc: 'Efectivo Bs', min: 400, max: 900, freq: 5, offset: 2 },
      { desc: 'Delivery', cat: 'Comida y bebidas', acc: 'Banco Banesco', min: 5500, max: 8000, freq: 9, offset: 3, tags: ['gasto hormiga'] },
      { desc: 'Cine', cat: 'Entretenimiento', acc: 'Efectivo Bs', min: 3500, max: 5500, freq: 13, offset: 5 },
      { desc: 'Recarga celular', cat: 'Servicios', acc: 'Efectivo Bs', min: 1000, max: 2000, freq: 9, offset: 4, tags: ['esencial'] },
      { desc: 'Dulcería', cat: 'Café y snacks', acc: 'Efectivo Bs', min: 1000, max: 2500, freq: 3, offset: 2, tags: ['gasto hormiga'] },
    ]
    for (let d = 44; d >= 0; d--) {
      for (const tpl of tpls) {
        if (d % tpl.freq !== tpl.offset) continue
        const times = rand() < (tpl.doubleChance ?? 0.25) ? 2 : 1
        for (let k = 0; k < times; k++) {
          const amount = Math.round((tpl.min + rand() * (tpl.max - tpl.min)) / 5) * 5
          push({
            type: 'EXPENSE',
            amount,
            accountId: accs[tpl.acc],
            categoryId: cats[tpl.cat],
            description: tpl.desc,
            tagIds: tpl.tags?.map((t) => tags[t]),
            date: daysAgo(d, 9 + Math.floor(rand() * 10)),
          })
        }
      }
    }

    // Transferencias (retiros cajero)
    for (const d of [31, 17, 5]) {
      push({
        type: 'TRANSFER',
        amount: 60000 + Math.round(rand() * 10000),
        accountId: accs['Banco Banesco'],
        toAccountId: accs['Efectivo Bs'],
        description: 'Retiro cajero',
        date: daysAgo(d, 8),
      })
    }

    // Insertar transacciones (lotes)
    for (let i = 0; i < txs.length; i += 25) {
      const batch = txs.slice(i, i + 25)
      await db.transaction.createMany({
        data: batch.map((t) => ({
          type: t.type,
          amount: t.amount,
          currency:
            t.accountId === accs['Efectivo $'] || t.accountId === accs['Zinli']
              ? 'USD'
              : t.accountId === accs['Binance USDT']
                ? 'USDT'
                : t.accountId === accs['Efectivo €']
                  ? 'EUR'
                  : 'VES',
          accountId: t.accountId,
          toAccountId: t.toAccountId ?? null,
          categoryId: t.categoryId ?? null,
          description: t.description ?? null,
          source: 'MANUAL',
          rateVesUsd: parAt(
            Math.abs(Math.round((Date.now() - t.date.getTime()) / 86400000))
          ),
          date: t.date,
        })),
      })
      // etiquetas
      for (const t of batch) {
        if (!t.tagIds?.length) continue
        const created = await db.transaction.findFirst({
          where: { description: t.description, date: t.date, amount: t.amount },
          select: { id: true },
        })
        if (created) {
          await db.transactionTag.createMany({
            data: t.tagIds.map((tagId) => ({ transactionId: created.id, tagId })),
          })
        }
      }
    }

    // ── Cambios de divisa (diferenciales) ──────────────────────
    await db.currencyExchange.create({
      data: {
        fromAccountId: accs['Binance USDT'],
        toAccountId: accs['Banco Banesco'],
        fromCurrency: 'USDT',
        toCurrency: 'VES',
        fromAmount: 100,
        toAmount: 95500,
        direction: 'SELL_FOREIGN',
        impliedRate: 955,
        marketRate: parAt(12),
        marketSource: 'PARALELO',
        differential: (955 - parAt(12)) * 100,
        date: daysAgo(12, 14),
        note: 'Venta USDT por P2P',
      },
    })
    const impliedBuy = 920
    await db.currencyExchange.create({
      data: {
        fromAccountId: accs['Banco Banesco'],
        toAccountId: accs['Efectivo $'],
        fromCurrency: 'VES',
        toCurrency: 'USD',
        fromAmount: 184000,
        toAmount: 200,
        direction: 'BUY_FOREIGN',
        impliedRate: impliedBuy,
        marketRate: parAt(25),
        marketSource: 'PARALELO',
        differential: (parAt(25) - impliedBuy) * 200,
        date: daysAgo(25, 11),
        note: 'Compra de efectivo',
      },
    })

    // ── Presupuestos ───────────────────────────────────────────
    await db.budget.createMany({
      data: [
        {
          name: 'Mercado del mes',
          categoryId: cats['Comida y bebidas'],
          limitAmount: 340,
          currency: 'USD',
          cycle: 'MONTHLY',
          startDate: daysAgo(60),
        },
        {
          name: 'Gastos hormiga',
          tagId: tags['gasto hormiga'],
          limitAmount: 45,
          currency: 'USD',
          cycle: 'WEEKLY',
          startDate: daysAgo(60),
        },
        {
          name: 'Mesada entretenimiento',
          categoryId: cats['Entretenimiento'],
          limitAmount: 25,
          currency: 'USD',
          cycle: 'BIWEEKLY',
          startDate: daysAgo(45),
        },
      ],
    })

    // ── Deudas ─────────────────────────────────────────────────
    const d1 = await db.debt.create({
      data: {
        kind: 'POR_PAGAR',
        person: 'María González',
        description: 'Préstamo para mercado',
        amount: 25,
        currency: 'USD',
        dueDate: daysAgo(-10),
        status: 'PARTIAL',
        rateVesUsd: parAt(20),
      } as any,
    })
    await db.debtPayment.createMany({
      data: [
        { debtId: d1.id, amount: 5, note: 'Primer abono', date: daysAgo(12) },
        { debtId: d1.id, amount: 5, note: 'Segundo abono', date: daysAgo(4) },
      ],
    })
    await db.debt.create({
      data: {
        kind: 'POR_PAGAR',
        person: 'Tarjeta Banesco',
        description: 'Cuota tarjeta de crédito',
        amount: 45000,
        currency: 'VES',
        dueDate: daysAgo(-5),
        status: 'PENDING',
        rateVesUsd: parAt(8),
      } as any,
    })
    const d3 = await db.debt.create({
      data: {
        kind: 'POR_COBRAR',
        person: 'Juan Pérez',
        description: 'Préstamo personal',
        amount: 150000,
        currency: 'VES',
        dueDate: daysAgo(2),
        status: 'PARTIAL',
        rateVesUsd: parAt(30),
      } as any,
    })
    await db.debtPayment.create({
      data: { debtId: d3.id, amount: 25000, note: 'Abono parcial', date: daysAgo(7) },
    })
    await db.debt.create({
      data: {
        kind: 'POR_COBRAR',
        person: 'Andreína Smith',
        description: 'Venta de laptop (saldo)',
        amount: 40,
        currency: 'USD',
        dueDate: daysAgo(-15),
        status: 'PENDING',
        rateVesUsd: parAt(6),
      } as any,
    })

    // ── Metas de ahorro ────────────────────────────────────────
    const g1 = await db.savingsGoal.create({
      data: {
        name: 'Fondo de emergencia',
        targetAmount: 1000,
        currency: 'USD',
        deadline: daysAgo(-180),
        color: '#38e07f',
        icon: 'shield-check',
      },
    })
    await db.goalContribution.createMany({
      data: [
        { goalId: g1.id, amount: 120, note: 'Aporte inicial', date: daysAgo(40) },
        { goalId: g1.id, amount: 80, note: 'Aporte mensual', date: daysAgo(22) },
        { goalId: g1.id, amount: 150, note: 'Bonificación', date: daysAgo(6) },
      ],
    })
    const g2 = await db.savingsGoal.create({
      data: {
        name: 'Viaje a la playa',
        targetAmount: 300,
        currency: 'USD',
        deadline: daysAgo(-60),
        color: '#2dd4bf',
        icon: 'palmtree',
      },
    })
    await db.goalContribution.createMany({
      data: [
        { goalId: g2.id, amount: 40, date: daysAgo(18) },
        { goalId: g2.id, amount: 25, date: daysAgo(4) },
      ],
    })
    const g3 = await db.savingsGoal.create({
      data: {
        name: 'Laptop nueva',
        targetAmount: 800,
        currency: 'USD',
        deadline: daysAgo(-120),
        color: '#c084fc',
        icon: 'laptop',
      },
    })
    await db.goalContribution.createMany({
      data: [
        { goalId: g3.id, amount: 100, date: daysAgo(35) },
        { goalId: g3.id, amount: 50, date: daysAgo(21) },
        { goalId: g3.id, amount: 60, date: daysAgo(7) },
      ],
    })

    await db.appMeta.update({ where: { key: 'seeded' }, data: { value: new Date().toISOString() } })
  } catch (e) {
    // liberar el claim para poder reintentar
    await db.appMeta.delete({ where: { key: 'seeded' } }).catch(() => {})
    throw e
  }
}

/**
 * Borra todos los datos financieros.
 * - reseedDemo=false → empieza de cero: se preserva AppMeta (flag `seeded`
 *   + preferencias del usuario) para que ensureSeed() NO vuelva a sembrar
 *   los datos demo en el siguiente refresh.
 * - reseedDemo=true → restaura el estado demo completo (regenera catálogos,
 *   cuentas, movimientos y preferencias por defecto).
 */
export async function wipeData(reseedDemo: boolean): Promise<void> {
  await db.transactionTag.deleteMany()
  await db.transaction.deleteMany()
  await db.currencyExchange.deleteMany()
  await db.debtPayment.deleteMany()
  await db.debt.deleteMany()
  await db.goalContribution.deleteMany()
  await db.savingsGoal.deleteMany()
  await db.budget.deleteMany()
  await db.weeklySummary.deleteMany()
  await db.account.deleteMany()
  await db.tag.deleteMany()
  await db.exchangeRate.deleteMany()

  if (reseedDemo) {
    // demo: se regenera todo desde cero (catálogo completo incluido)
    await db.category.deleteMany()
    seedPromise = null
    await db.appMeta.deleteMany()
    await ensureSeed()
    return
  }

  // empieza de cero: conservar el catálogo base (no hay UI para recrearlo)
  await db.category.deleteMany({ where: { isDefault: false } })
  seedPromise = null

  // mantener el flag `seeded` (evita re-siembra automática del demo) y las
  // preferencias del usuario; crearlas solo si no existen
  await db.appMeta.upsert({
    where: { key: 'seeded' },
    update: {},
    create: { key: 'seeded', value: new Date().toISOString() },
  })
  await db.appMeta.upsert({
    where: { key: 'baseCurrency' },
    update: {},
    create: { key: 'baseCurrency', value: 'VES' },
  })
  await db.appMeta.upsert({
    where: { key: 'valuationSource' },
    update: {},
    create: { key: 'valuationSource', value: 'PARALELO' },
  })
}
