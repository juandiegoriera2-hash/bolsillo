// ─────────────────────────────────────────────────────────────────
// Bolsillo — Serializadores DTO (server → cliente)
// ─────────────────────────────────────────────────────────────────
import type { Prisma } from '@prisma/client'

export type TxInclude = Prisma.TransactionGetPayload<{
  include: {
    account: true
    toAccount: true
    category: true
    tags: { include: { tag: true } }
  }
}>

export type TxDTO = {
  id: string
  type: string
  amount: number
  currency: string
  accountId: string
  accountName: string
  accountColor: string
  accountIcon: string
  toAccountId: string | null
  toAccountName: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  description: string | null
  reference: string | null
  source: string
  rateVesUsd: number | null
  date: string
  tags: Array<{ id: string; name: string; color: string }>
}

export function serializeTx(t: TxInclude): TxDTO {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    accountId: t.accountId,
    accountName: t.account?.name ?? '',
    accountColor: t.account?.color ?? '#94a3b8',
    accountIcon: t.account?.icon ?? 'wallet',
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount?.name ?? null,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    categoryColor: t.category?.color ?? null,
    categoryIcon: t.category?.icon ?? null,
    description: t.description,
    reference: t.reference,
    source: t.source,
    rateVesUsd: t.rateVesUsd,
    date: t.date.toISOString(),
    tags: t.tags.map((tt) => ({
      id: tt.tag?.id ?? tt.tagId,
      name: tt.tag?.name ?? '',
      color: tt.tag?.color ?? '#94a3b8',
    })),
  }
}

export const TX_INCLUDE = {
  account: true,
  toAccount: true,
  category: true,
  tags: { include: { tag: true } },
} satisfies Prisma.TransactionInclude
