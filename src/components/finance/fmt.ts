// Utilidades de fecha en horario Venezuela (UTC-4)

/** ISO → partes de fecha en Caracas */
function caracasParts(iso: string) {
  const d = new Date(new Date(iso).getTime() - 4 * 3600000)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
  }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "Hoy" · "Ayer" · "sáb 26 oct" */
export function dayLabel(iso: string): string {
  const p = caracasParts(iso)
  const now = new Date(Date.now() - 4 * 3600000)
  const today = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() }
  if (p.y === today.y && p.m === today.m && p.d === today.d) return 'Hoy'
  if (p.y === today.y && p.m === today.m && p.d === today.d - 1) return 'Ayer'
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][
    new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  ]
  return `${wd} ${p.d} ${MONTHS[p.m - 1]}`
}

/** "30 oct 2026 · 14:05" */
export function fullDateTime(iso: string): string {
  const p = caracasParts(iso)
  const hh = String(p.hh).padStart(2, '0')
  const mm = String(p.mm).padStart(2, '0')
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y} · ${hh}:${mm}`
}

/** "30 oct" */
export function shortDate(iso: string): string {
  const p = caracasParts(iso)
  return `${p.d} ${MONTHS[p.m - 1]}`
}

/** "30/10" desde dateKey yyyy-MM-dd */
export function dateKeyShort(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`
}

/** "30 oct 2026" */
export function fullDate(iso: string): string {
  const p = caracasParts(iso)
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`
}

/** días hasta una fecha (negativo si venció) */
export function daysUntil(iso: string): number {
  const target = new Date(iso).getTime()
  return Math.ceil((target - Date.now()) / 86400000)
}
