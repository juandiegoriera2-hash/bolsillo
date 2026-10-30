// ─────────────────────────────────────────────────────────────────
// Bolsillo — Helpers de IA (z-ai-web-dev-sdk · solo backend)
// ─────────────────────────────────────────────────────────────────
import ZAI from 'z-ai-web-dev-sdk'

let instance: Promise<any> | null = null

export function getZai(): Promise<any> {
  if (!instance) instance = ZAI.create()
  return instance
}

export type SimpleMessage = { role: 'user' | 'assistant'; content: string }

/** Chat de texto (system prompt va como primer mensaje 'assistant' según el SDK) */
export async function chatText(messages: SimpleMessage[]): Promise<string> {
  const zai = await getZai()
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  })
  return completion?.choices?.[0]?.message?.content ?? ''
}

/** Visión (VLM) sobre una imagen data-URL */
export async function visionText(prompt: string, imageDataUrl: string): Promise<string> {
  const zai = await getZai()
  const completion = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  })
  return completion?.choices?.[0]?.message?.content ?? ''
}

/** Transcripción de voz (ASR) desde base64 */
export async function transcribeAudio(fileBase64: string): Promise<string> {
  const zai = await getZai()
  const response = await zai.audio.asr.create({ file_base64: fileBase64 })
  return (response?.text ?? '').trim()
}

/** Extrae el primer objeto JSON válido de una respuesta de LLM */
export function extractJson<T = any>(raw: string): T | null {
  if (!raw) return null
  let text = raw.trim()
  // quitar fences de markdown
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = text.indexOf('{')
  if (start === -1) return null
  // encontrar la llave que cierra el primer objeto completo
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = text.slice(start, i + 1)
        try {
          return JSON.parse(candidate) as T
        } catch {
          return null
        }
      }
    }
  }
  return null
}
