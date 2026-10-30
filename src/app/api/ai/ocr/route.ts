import { NextResponse } from 'next/server'
import { visionText, extractJson } from '@/lib/ai'

export const maxDuration = 90

export type OcrResult = {
  banco: string | null
  tipoOperacion: string | null
  monto: number | null
  moneda: 'VES' | 'USD' | 'EUR' | 'USDT' | null
  fecha: string | null
  referencia: string | null
  persona: string | null
  telefono: string | null
  detalle: string | null
  notas: string | null
}

const PROMPT = `Analiza esta captura de pantalla de un comprobante de pago venezolano (Pago Móvil, transferencia de Mercantil, Banesco, BDV, BNC, Banco Provincial, Banco de Venezuela, Binance P2P, Zinli o Zelle).

Extrae los datos y responde SOLO con un JSON válido:
{
  "banco": "banco o plataforma detectada",
  "tipoOperacion": "Pago Móvil" | "Transferencia" | "Recarga" | "Recibo" | "Otro",
  "monto": 1234.56,
  "moneda": "VES" | "USD" | "EUR" | "USDT",
  "fecha": "YYYY-MM-DD",
  "referencia": "número de referencia",
  "persona": "nombre de la persona o comercio",
  "telefono": "teléfono o cédula si aparece",
  "detalle": "texto clave del comprobante",
  "notas": "algo ambiguo que deba revisar el usuario"
}

REGLAS CRÍTICAS:
- Los montos venezolanos usan punto para miles y coma para decimales: "1.234,56" → 1234.56. Devuelve monto como número puro.
- "Bs" o bolívares → "VES". Comprobantes de Binance/Zinli/Zelle en dólares → "USD". USDT → "USDT".
- La fecha suele venir dd/mm/yyyy (a veces con hora). Conviértela a YYYY-MM-DD.
- El monto de la operación NO es el saldo disponible de la cuenta.
- Si un dato no aparece o no es legible, usa null en ese campo.
- No inventes datos.`

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const image = String(body?.image ?? '')
    if (!image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Imagen inválida' }, { status: 400 })
    }
    const completion = await visionText(PROMPT, image)
    const json = extractJson<OcrResult>(completion)
    if (!json) {
      return NextResponse.json(
        { error: 'No pude leer el comprobante. Prueba con una captura más nítida.' },
        { status: 422 }
      )
    }
    // normalizar monto (por si el modelo devuelve string)
    let monto: number | null = null
    if (json.monto != null) {
      const n = typeof json.monto === 'number' ? json.monto : parseFloat(String(json.monto).replace(/\./g, '').replace(',', '.'))
      monto = Number.isFinite(n) ? n : null
    }
    return NextResponse.json({ ...json, monto })
  } catch (e) {
    console.error('[ai/ocr]', e)
    return NextResponse.json({ error: 'Error analizando el comprobante' }, { status: 500 })
  }
}
