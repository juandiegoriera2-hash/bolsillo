// ─────────────────────────────────────────────────────────────────
// Bolsillo — Importador de estados de cuenta bancarios (cliente)
// Lee el archivo que descargas de tu banca en línea (Excel .xls/.xlsx
// o CSV/TXT) y extrae los movimientos: fecha, concepto, débito/crédito
// y referencia. Formatos soportados: Mercantil, Banesco, BNC y genérico.
// ─────────────────────────────────────────────────────────────────
'use client'

import * as XLSX from 'xlsx'
import { parseAmount } from '@/lib/finance'

export type ParsedBankRow = {
  id: string
  date: string // yyyy-MM-dd
  description: string
  amount: number // >0 ingreso, <0 gasto
  reference: string
}

export type ParseResult = {
  rows: ParsedBankRow[]
  totalRows: number
  skipped: number
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/** Detecta columnas por encabezado (flexible con acentos/mayúsculas) */
type ColMap = {
  date?: number
  description?: number
  debit?: number
  credit?: number
  amount?: number
  reference?: number
  balance?: number
}

function mapHeaders(headers: string[]): ColMap {
  const map: ColMap = {}
  headers.forEach((h, i) => {
    const n = norm(h)
    if (!n) return
    if (map.date === undefined && /(fecha|date|dia)/.test(n)) map.date = i
    else if (map.description === undefined && /(concepto|descrip|detalle|operacion|movimiento|narrativa|observacion)/.test(n)) map.description = i
    else if (map.debit === undefined && /(debito|debit|egreso|pago|retiro|cargo|salida)/.test(n)) map.debit = i
    else if (map.credit === undefined && /(credito|credit|ingreso|abono|deposito|entrada)/.test(n)) map.credit = i
    else if (map.amount === undefined && /(monto|amount|importe|valor|total)/.test(n)) map.amount = i
    else if (map.reference === undefined && /(referencia|ref|numero|nro|comprobante|operacion no)/.test(n)) map.reference = i
    else if (map.balance === undefined && /(saldo|balance|disponible)/.test(n)) map.balance = i
  })
  return map
}

/** dd/mm/yyyy · dd-mm-yyyy · yyyy-mm-dd · dd/mm/yy → yyyy-MM-dd */
function parseDate(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/.exec(s)
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // fechas seriales de Excel (número)
  const n = Number(s)
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return null
}

/** Monto robusto: "(1.234,56)" → -1234.56 · "Bs 1.234,56-" → -1234.56 */
function parseBankAmount(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim()
  if (!s) return NaN
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/(^-)|(-$)|(^\s*-)/.test(String(v).trim()) && !s.includes('-')) negative = true
  s = s.replace(/-/g, '')
  const n = parseAmount(s)
  if (!Number.isFinite(n)) return NaN
  return negative ? -n : n
}

const isNumericish = (v: unknown) => Number.isFinite(parseBankAmount(v))
const isDateish = (v: unknown) => parseDate(v) !== null

/** Heurística sin encabezados: col de fechas, col de texto más larga, col numérica */
function detectColumns(rows: unknown[][]): ColMap {
  const cols = rows[0]?.length ?? 0
  const score = (fn: (v: unknown) => boolean) => (ci: number) => {
    let hits = 0
    for (const r of rows.slice(0, 30)) if (fn(r[ci])) hits++
    return hits
  }
  const dateScore = Array.from({ length: cols }, (_, ci) => score(isDateish)(ci))
  const numScore = Array.from({ length: cols }, (_, ci) => score(isNumericish)(ci))
  const textLen = Array.from({ length: cols }, (_, ci) => {
    let len = 0
    for (const r of rows.slice(0, 30)) len = Math.max(len, String(r[ci] ?? '').length)
    return len
  })
  const dateCol = dateScore.indexOf(Math.max(...dateScore))
  const map: ColMap = {}
  if (dateScore[dateCol] > 0) map.date = dateCol
  // descripción: la columna de texto más larga que no sea fecha ni saldo
  let descCol = -1
  let best = 0
  for (let ci = 0; ci < cols; ci++) {
    if (ci === map.date) continue
    if (numScore[ci] >= rows.slice(0, 30).length * 0.7) continue // casi toda numérica
    if (textLen[ci] > best) {
      best = textLen[ci]
      descCol = ci
    }
  }
  if (descCol >= 0 && best >= 4) map.description = descCol
  // monto: columnas numéricas restantes (la primera)
  const numCols: number[] = []
  for (let ci = 0; ci < cols; ci++) {
    if (ci === map.date || ci === map.description) continue
    if (numScore[ci] >= rows.slice(0, 30).length * 0.5) numCols.push(ci)
  }
  if (numCols.length === 1) map.amount = numCols[0]
  else if (numCols.length >= 2) {
    map.debit = numCols[0]
    map.credit = numCols[1]
  }
  return map
}

function rowsFromSheet(sheet: XLSX.WorkSheet): unknown[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  })
  return rows.filter((r) => r.some((c) => c != null && String(c).trim() !== ''))
}

/** Convierte la matriz cruda en movimientos usando el mapeo de columnas */
function toBankRows(rows: unknown[][], map: ColMap, hasHeader: boolean): ParsedBankRow[] {
  const out: ParsedBankRow[] = []
  const dataRows = hasHeader ? rows.slice(1) : rows
  for (const r of dataRows) {
    const date = map.date !== undefined ? parseDate(r[map.date]) : null
    if (!date) continue
    let amount = NaN
    if (map.debit !== undefined || map.credit !== undefined) {
      const deb = map.debit !== undefined ? Math.abs(parseBankAmount(r[map.debit])) : NaN
      const cre = map.credit !== undefined ? Math.abs(parseBankAmount(r[map.credit])) : NaN
      if (Number.isFinite(deb) && deb > 0) amount = -deb
      else if (Number.isFinite(cre) && cre > 0) amount = cre
    } else if (map.amount !== undefined) {
      amount = parseBankAmount(r[map.amount])
    }
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) continue
    const description =
      map.description !== undefined ? String(r[map.description] ?? '').trim().slice(0, 120) : ''
    const reference =
      map.reference !== undefined ? String(r[map.reference] ?? '').trim().slice(0, 40) : ''
    out.push({
      id: `r_${out.length}_${Math.random().toString(36).slice(2, 7)}`,
      date,
      description: description || 'Movimiento importado',
      amount: Math.round(amount * 100) / 100,
      reference,
    })
  }
  return out
}

/** ¿La primera fila parece un encabezado? (texto reconocible, sin fecha válida) */
function looksLikeHeader(row: unknown[]): boolean {
  const joined = norm(row.join(' '))
  if (!joined) return false
  if (isDateish(row.find((c) => isDateish(c)))) return false
  return /(fecha|concepto|descrip|debito|credito|monto|referencia|saldo|detalle)/.test(joined)
}

/** Lee y parsea un archivo de estado de cuenta (Excel o CSV/TXT) */
export async function parseBankFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase()
  let rows: unknown[][] = []

  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    const text = await file.text()
    // delimitador: ; , o tab (el que más aparezca en la primera línea con datos)
    const firstLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5)
    const count = (ch: string) => firstLines.reduce((s, l) => s + (l.split(ch).length - 1), 0)
    const delim = count(';') >= count(',') && count(';') >= count('\t') ? ';' : count('\t') > count(',') ? '\t' : ','
    rows = []
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      rows.push(line.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
    }
  } else {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    // hoja con más filas (algunos bancos agregan hojas de resumen)
    let best: unknown[][] = []
    for (const sheetName of wb.SheetNames) {
      const sheetRows = rowsFromSheet(wb.Sheets[sheetName])
      if (sheetRows.length > best.length) best = sheetRows
    }
    rows = best
  }

  if (rows.length < 2) {
    throw new Error('El archivo no tiene movimientos legibles. Descarga el estado de cuenta desde tu banca en línea e inténtalo de nuevo.')
  }

  const hasHeader = looksLikeHeader(rows[0])
  const map = hasHeader ? mapHeaders(rows[0].map((c) => String(c ?? ''))) : detectColumns(rows)
  // si el mapeo por encabezado no encontró fecha/monto, probar heurística
  if (map.date === undefined || (map.amount === undefined && map.debit === undefined && map.credit === undefined)) {
    const alt = detectColumns(rows)
    if (map.date === undefined) map.date = alt.date
    if (map.amount === undefined && map.debit === undefined && map.credit === undefined) {
      map.amount = alt.amount
      map.debit = alt.debit
      map.credit = alt.credit
    }
    if (map.description === undefined) map.description = alt.description
    if (map.reference === undefined) map.reference = alt.reference
  }
  if (map.date === undefined) {
    throw new Error('No encontré la columna de fecha. Asegúrate de descargar el estado de cuenta completo (con fecha, concepto y monto).')
  }

  const all = toBankRows(rows, map, hasHeader)
  if (all.length === 0) {
    throw new Error('Encontré el archivo pero no pude leer movimientos con montos. Prueba descargarlo en formato Excel o CSV.')
  }

  // deduplicar por fecha+monto+descripción (encabezados repetidos, totales)
  const seen = new Set<string>()
  const unique: ParsedBankRow[] = []
  for (const r of all) {
    const key = `${r.date}|${r.amount}|${norm(r.description).slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }

  return {
    rows: unique.slice(0, 500),
    totalRows: all.length,
    skipped: all.length - unique.length,
  }
}
