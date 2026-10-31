import { NextResponse } from 'next/server'
import { ensureSeed } from '@/lib/seed'
import { transcribeAudio } from '@/lib/ai'
import { handleChatMessage } from '@/lib/assistant'

export const maxDuration = 90

/** Voz → texto (ASR) → pipeline del asistente */
export async function POST(req: Request) {
  try {
    await ensureSeed()
    const body = await req.json()
    const audioBase64 = String(body?.audioBase64 ?? '')
    if (!audioBase64) return NextResponse.json({ error: 'Audio vacío' }, { status: 400 })
    let transcript: string
    try {
      transcript = await transcribeAudio(audioBase64)
    } catch (asrErr) {
      // la API de transcripción rechazó el audio (muy corto, silencio, formato)
      console.error('[ai/voice ASR]', asrErr)
      return NextResponse.json(
        {
          error:
            'No pude entender el audio 🎙️ Intenta de nuevo: mantén el botón, habla claro y suelta al terminar.',
        },
        { status: 422 }
      )
    }
    if (!transcript) {
      return NextResponse.json(
        { error: 'No escuché nada. Intenta hablar más fuerte o más cerca del micrófono.' },
        { status: 422 }
      )
    }
    const { reply, results } = await handleChatMessage(transcript)
    return NextResponse.json({ transcript, reply, results })
  } catch (e) {
    console.error('[ai/voice]', e)
    return NextResponse.json({ error: 'Error procesando el audio' }, { status: 500 })
  }
}
