import { NextResponse } from 'next/server'
import { visionText, extractJson, aiErrorMessage } from '@/lib/ai'
import { parseAmount } from '@/lib/finance'

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
  "monto": "1.234,56",
  "moneda": "VES" | "USD" | "EUR" | "USDT",
  "fecha": "YYYY-MM-DD",
  "referencia": "número de referencia",
  "persona": "nombre de la persona o comercio",
  "telefono": "teléfono o cédula si aparece",
  "detalle": "texto clave del comprobante",
  "notas": "algo ambiguo que deba revisar el usuario"
}

REGLAS CRÍTICAS:
- "monto" es un STRING con el monto EXACTAMENTE como aparece en el comprobante, con sus separadores originales (ej: "50.000,00"). No lo conviertas a número.
- Los montos venezolanos usan punto para miles y coma para decimales: "1.234,56" = mil doscientos treinta y cuatro con 56. NUNCA trunques: "50.000" son cincuenta mil, NO 50.
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
    // normalizar monto (el modelo devuelve string tal cual el comprobante)
    let monto: number | null = null
    if (json.monto != null) {
      const n = parseAmount(json.monto as string | number)
      monto = Number.isFinite(n) ? n : null
    }
    return NextResponse.json({ ...json, monto })
  } catch (e) {
    console.error('[ai/ocr]', e)
    return NextResponse.json(
      { error: aiErrorMessage(e, 'Error analizando el comprobante') },
      { status: 500 }
    )
  }
}
