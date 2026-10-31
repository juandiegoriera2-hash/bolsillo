// ─────────────────────────────────────────────────────────────────
// Bolsillo — Helpers de IA
// Proveedor (en orden):
//  1) z-ai-web-dev-sdk — disponible en el entorno de desarrollo
//  2) API compatible con OpenAI — producción (Vercel), vía variables:
//     AI_BASE_URL · AI_API_KEY · AI_MODEL · AI_VISION_MODEL (opciones)
//     ej. OpenRouter (https://openrouter.ai/api/v1) que tiene modelos gratis
// Si ningún proveedor está disponible, se lanza un error claro en español
// que las rutas devuelven al usuario (nada de cuelgues ni errores crípticos).
// ─────────────────────────────────────────────────────────────────
import ZAI from 'z-ai-web-dev-sdk'

let instance: Promise<any> | null = null

function getZai(): Promise<any> {
  if (!instance) instance = ZAI.create()
  return instance
}

// ── Proveedor OpenAI-compatible (opcional, producción) ───────────
type OpenAiCfg = { base: string; key: string; model: string; visionModel: string }

function openAiConfig(): OpenAiCfg | null {
  const base = process.env.AI_BASE_URL
  const key = process.env.AI_API_KEY
  if (!base || !key) return null
  return {
    base: base.replace(/\/+$/, ''),
    key,
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    visionModel: process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
  }
}

async function openAiChat(messages: unknown[], model: string, cfg: OpenAiCfg): Promise<string> {
  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model, messages }),
  })
  if (!res.ok) {
    throw new Error(`IA: el proveedor respondió ${res.status}. Revisa AI_MODEL / la clave en Vercel.`)
  }
  const json = (await res.json()) as any
  return json?.choices?.[0]?.message?.content ?? ''
}

export const NO_AI_MSG =
  'La IA no está disponible en este despliegue. Puedes activarla gratis desde Vercel con las variables AI_BASE_URL, AI_API_KEY y AI_MODEL (ver DEPLOY.md, sección IA).'

/** Mensaje de error para rutas: prioriza el mensaje explicativo de la capa IA */
export function aiErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && (e.message.startsWith('La IA no') || e.message.startsWith('IA:'))
    ? e.message
    : fallback
}

export type SimpleMessage = { role: 'user' | 'assistant'; content: string }

/** Chat de texto (system prompt va como primer mensaje 'assistant' según el SDK) */
export async function chatText(messages: SimpleMessage[]): Promise<string> {
  // 1) z-ai (entorno de desarrollo)
  try {
    const zai = await getZai()
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    const out = completion?.choices?.[0]?.message?.content ?? ''
    if (out) return out
  } catch {
    /* sin credenciales fuera del entorno de desarrollo */
  }
  // 2) OpenAI-compatible (producción)
  const cfg = openAiConfig()
  if (cfg) return openAiChat(messages, cfg.model, cfg)
  throw new Error(NO_AI_MSG)
}

/** Visión (VLM) sobre una imagen data-URL */
export async function visionText(prompt: string, imageDataUrl: string): Promise<string> {
  // 1) z-ai (entorno de desarrollo)
  try {
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
    const out = completion?.choices?.[0]?.message?.content ?? ''
    if (out) return out
  } catch {
    /* sin credenciales fuera del entorno de desarrollo */
  }
  // 2) OpenAI-compatible con modelo de visión (producción)
  const cfg = openAiConfig()
  if (cfg) {
    return openAiChat(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      cfg.visionModel,
      cfg
    )
  }
  throw new Error(NO_AI_MSG)
}

/** Transcripción de voz (ASR) desde base64 — solo z-ai (sin equivalente universal gratis) */
export async function transcribeAudio(fileBase64: string): Promise<string> {
  try {
    const zai = await getZai()
    const response = await zai.audio.asr.create({ file_base64: fileBase64 })
    return (response?.text ?? '').trim()
  } catch {
    throw new Error(NO_AI_MSG)
  }
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
