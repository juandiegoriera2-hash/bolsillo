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

/** ¿El error parece de autenticación (token caducado/rotado)? */
function isAuthError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /\b401\b|unauthorized|x-token|api key|credencial/i.test(msg)
}

/** Invalida la instancia cacheada — la próxima llamada relee la config fresca */
function resetZai(): void {
  instance = null
}

// ── Proveedor OpenAI-compatible (opcional, producción) ───────────
type OpenAiCfg = { base: string; key: string; model: string[]; visionModel: string[] }

function openAiConfig(): OpenAiCfg | null {
  const base = process.env.AI_BASE_URL
  const key = process.env.AI_API_KEY
  if (!base || !key) return null
  return {
    base: base.replace(/\/+$/, ''),
    key,
    model: modelList(process.env.AI_MODEL).length ? modelList(process.env.AI_MODEL) : modelList(DEFAULT_MODELS),
    visionModel: modelList(process.env.AI_VISION_MODEL).length
      ? modelList(process.env.AI_VISION_MODEL)
      : modelList(process.env.AI_MODEL).length
        ? modelList(process.env.AI_MODEL)
        : modelList(DEFAULT_MODELS),
  }
}

async function openAiChatOnce(messages: unknown[], model: string, cfg: OpenAiCfg): Promise<Response> {
  return fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model, messages }),
  })
}

/** Modelo(s): AI_MODEL puede ser una lista separada por comas — se prueban
 *  en orden y si uno falla con 429 (saturado) o 404 (retirado) se salta al
 *  siguiente. El error del último intento es el que se reporta. */
function modelList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const DEFAULT_MODELS = 'gpt-4o-mini'

async function openAiChat(messages: unknown[], models: string[], cfg: OpenAiCfg): Promise<string> {
  let lastErr = 'sin modelos configurados'
  for (const model of models) {
    try {
      const res = await openAiChatOnce(messages, model, cfg)
      if (res.ok) {
        const json = (await res.json()) as any
        return json?.choices?.[0]?.message?.content ?? ''
      }
      if (res.status === 429 || res.status === 404 || res.status === 400) {
        // este modelo está saturado o ya no existe: probar el siguiente
        lastErr = `el modelo «${model}» respondió ${res.status}`
        continue
      }
      // error de clave u otro: abortar (no tiene sentido seguir)
      throw new Error(`IA: el proveedor respondió ${res.status}. Revisa AI_API_KEY / AI_BASE_URL en Vercel.`)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`IA: ningún modelo respondió (${lastErr}). Revisa AI_MODEL en Vercel — puedes poner varios separados por coma.`
  )
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
  //    Reintenta 1 vez con config fresca si el token cacheado caducó (rotación).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const zai = await getZai()
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      })
      const out = completion?.choices?.[0]?.message?.content ?? ''
      if (out) return out
      console.warn('[ai] zai chat respondió vacío')
      break
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[ai] zai chat falló:', msg)
      if (attempt === 0 && isAuthError(e)) {
        resetZai() // token caducado → releer config y reintentar
        continue
      }
      break
    }
  }
  // 2) OpenAI-compatible (producción)
  const cfg = openAiConfig()
  if (cfg) return openAiChat(messages, cfg.model, cfg)
  throw new Error(NO_AI_MSG)
}

/** Visión (VLM) sobre una imagen data-URL */
export async function visionText(prompt: string, imageDataUrl: string): Promise<string> {
  // 1) z-ai (entorno de desarrollo)
  for (let attempt = 0; attempt < 2; attempt++) {
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
      console.warn('[ai] zai vision respondió vacío')
      break
    } catch (e) {
      console.error('[ai] zai vision falló:', e instanceof Error ? e.message : e)
      if (attempt === 0 && isAuthError(e)) {
        resetZai()
        continue
      }
      break
    }
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

/** Transcripción de voz (ASR) desde base64.
 *  1) z-ai (entorno de desarrollo) · 2) API compatible OpenAI con
 *  endpoint /audio/transcriptions (ej. Groq gratis: whisper-large-v3) */
export async function transcribeAudio(fileBase64: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const zai = await getZai()
      const response = await zai.audio.asr.create({ file_base64: fileBase64 })
      return (response?.text ?? '').trim()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[ai] zai asr falló:', msg)
      // sin archivo de config → IA no disponible en este despliegue (503)
      if (/configuration file not found/i.test(msg)) break
      if (attempt === 0 && isAuthError(e)) {
        resetZai() // token caducado → releer config y reintentar
        continue
      }
      // otros errores de zai (audio muy corto, silencio, formato…):
      // se reportan tal cual para que la ruta los distinga (422)
      throw e instanceof Error ? e : new Error(String(e))
    }
  }
  // 2) OpenAI-compatible (producción): /audio/transcriptions (multipart)
  const cfg = openAiConfig()
  if (cfg) {
    const asrModel = process.env.AI_ASR_MODEL || 'whisper-large-v3'
    const form = new FormData()
    form.append(
      'file',
      new Blob([Buffer.from(fileBase64, 'base64')], { type: 'audio/wav' }),
      'audio.wav'
    )
    form.append('model', asrModel)
    const res = await fetch(`${cfg.base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}` },
      body: form,
    })
    if (res.ok) {
      const json = (await res.json()) as { text?: string }
      const text = (json?.text ?? '').trim()
      if (text) return text
      throw new Error('La transcripción llegó vacía')
    }
    throw new Error(`IA: el proveedor de voz respondió ${res.status}. Revisa AI_ASR_MODEL / la clave.`)
  }
  throw new Error(NO_AI_MSG)
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
