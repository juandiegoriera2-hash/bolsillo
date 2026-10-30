import { NextResponse } from 'next/server'
import { ensureSeed } from '@/lib/seed'
import { handleChatMessage } from '@/lib/assistant'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    await ensureSeed()
    const body = await req.json()
    const message = String(body?.message ?? '').trim()
    if (!message) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })
    const result = await handleChatMessage(message)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[ai/chat]', e)
    return NextResponse.json(
      { error: 'El asistente no está disponible en este momento' },
      { status: 500 }
    )
  }
}
