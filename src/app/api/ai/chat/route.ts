import { NextResponse } from 'next/server'
import { ensureSeed } from '@/lib/seed'
import { handleChatMessage } from '@/lib/assistant'
import { aiErrorMessage } from '@/lib/ai'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    await ensureSeed()
    const body = await req.json()
    const message = String(body?.message ?? '').trim()
    // capturas de pantalla adjuntas (data URLs, máx 4)
    const images: string[] = Array.isArray(body?.images)
      ? body.images
          .filter((i: unknown) => typeof i === 'string' && String(i).startsWith('data:image/'))
          .slice(0, 4)
      : []
    if (!message && images.length === 0) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })
    }
    const result = await handleChatMessage(message, images)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[ai/chat]', e)
    return NextResponse.json(
      { error: aiErrorMessage(e, 'El asistente no está disponible en este momento') },
      { status: 500 }
    )
  }
}
