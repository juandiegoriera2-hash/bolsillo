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
    // sin max_tokens Groq corta en 1024: una importación de capturas con
    // 20+ movimientos (JSON largo) quedaría truncada. 8000 es seguro
    // para gpt-oss-120b y llama-4-scout (límite 8192).
    body: JSON.stringify({ model, messages, max_tokens: 8000 }),
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

/** Proveedor de visión dedicado (VISION_*): opcional, permite usar un
 *  proveedor distinto solo para imágenes (ej. OpenRouter gratis) sin
 *  tocar el proveedor de chat (AI_*). */
function visionProviderConfig(): OpenAiCfg | null {
  const base = process.env.VISION_BASE_URL
  const key = process.env.VISION_API_KEY
  if (!base || !key) return null
  const models = modelList(process.env.VISION_MODEL)
  return {
    base: base.replace(/\/+$/, ''),
    key,
    model: models,
    visionModel: models,
  }
}

/** ¿El ID de un modelo parece tener capacidad de visión? (heurística
 *  para autodetectar reemplazos cuando el configurado fue retirado) */
function looksLikeVisionModel(id: string): boolean {
  return /vision|multimodal|scout|maverick|pixtral|gemma|(^|[-/_])vl([-/_]|$)/i.test(id)
}

/** Catálogo de modelos del proveedor (GET /models, compatible OpenAI) */
async function listProviderModels(cfg: OpenAiCfg): Promise<string[]> {
  try {
    const res = await fetch(`${cfg.base}/models`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
    })
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    return (json?.data ?? []).map((m) => String(m?.id ?? '')).filter(Boolean)
  } catch {
    return []
  }
}

/** Catálogo para diagnóstico (/api/health?models=1): lista los modelos
 *  disponibles en el proveedor de IA configurado. */
export async function providerModels(): Promise<{
  base: string
  chatModels: string[]
  visionCandidates: string[]
} | null> {
  const cfg = openAiConfig()
  if (!cfg) return null
  const catalog = await listProviderModels(cfg)
  return {
    base: cfg.base,
    chatModels: catalog,
    visionCandidates: catalog.filter(looksLikeVisionModel),
  }
}

async function openAiChat(messages: unknown[], models: string[], cfg: OpenAiCfg): Promise<string> {
  let lastErr = 'sin modelos configurados'
  for (const model of models) {
    try {
      const res = await openAiChatOnce(messages, model, cfg)
      if (res.ok) {
        const json = (await res.json()) as any
        return json?.choices?.[0]?.message?.content ?? ''
      }
      if (res.status === 429 || res.status === 404 || res.status === 400 || res.status === 403) {
        // este modelo está saturado, retirado o sin acceso: probar el siguiente
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

/** Sin modelo de visión disponible (Groq retiró los suyos): instrucción clara */
export const NO_VISION_MSG =
  'IA: este despliegue no tiene modelo de visión, así que no puedo leer capturas todavía. Arreglado en 3 minutos: agrega VISION_BASE_URL, VISION_API_KEY y VISION_MODEL en Vercel con una clave gratis de Google AI Studio (pasos exactos en DEPLOY.md, sección “Leer capturas con IA”). El chat de texto y voz siguen funcionando normal.'

/** Mensaje de error para rutas: prioriza el mensaje explicativo de la capa IA */
export function aiErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && (e.message.startsWith('La IA no') || e.message.startsWith('IA:'))
    ? e.message
    : fallback
}

export type SimpleMessage = { role: 'user' | 'assistant'; content: string }

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** Llamada de VISIÓN (mensajes con imágenes) a proveedor OpenAI-compatible:
 *  cadena de rescate → 1) proveedor dedicado VISION_* si existe →
 *  2) modelo de visión del proveedor general (AI_VISION_MODEL/AI_MODEL) →
 *  3) autodetección de candidatos con visión en el catálogo del proveedor
 *  (por si Groq retira/renombra el modelo configurado). */
async function openAiVision(messages: unknown[]): Promise<string> {
  // 1) proveedor de visión dedicado (VISION_*)
  const vcfg = visionProviderConfig()
  if (vcfg) {
    try {
      return await openAiChat(messages, vcfg.visionModel, vcfg)
    } catch (e) {
      console.warn('[ai] proveedor de visión dedicado falló:', e instanceof Error ? e.message : e)
    }
  }
  // 2) proveedor general con modelo de visión
  const cfg = openAiConfig()
  if (cfg) {
    try {
      return await openAiChat(messages, cfg.visionModel, cfg)
    } catch (e) {
      // 3) modelo retirado/renombreado (404/403): buscar candidatos con
      // visión en el catálogo real del proveedor y reintentar. Los modelos
      // sin visión fallan con 400 y se saltan solos.
      const msg = e instanceof Error ? e.message : String(e)
      if (/respondi\u00f3 40[43]/.test(msg)) {
        const catalog = await listProviderModels(cfg)
        const fresh = catalog.filter(
          (id) => looksLikeVisionModel(id) && !cfg.visionModel.includes(id)
        )
        if (fresh.length) {
          console.warn('[ai] modelos de visión configurados fallaron; reintentando con:', fresh.slice(0, 3).join(', '))
          return await openAiChat(messages, fresh.slice(0, 3), cfg)
        }
        throw new Error(NO_VISION_MSG)
      }
      throw e
    }
  }
  throw new Error(NO_AI_MSG)
}

/**
 * Chat de texto (system prompt va como primer mensaje 'assistant' según el SDK).
 * Si se adjuntan imágenes (data URLs), el último mensaje de usuario se convierte
 * en contenido multimodal y en producción se usa la cadena de visión
 * (VISION_* → AI_VISION_MODEL → autodetección).
 */
export async function chatText(messages: SimpleMessage[], images: string[] = []): Promise<string> {
  const multimodal = images.length > 0
  let built: Array<{ role: string; content: unknown }> = messages
  if (multimodal) {
    built = messages.map((m, i) => {
      const isLastUser = i === messages.length - 1 && m.role === 'user'
      if (!isLastUser) return { role: m.role, content: m.content }
      const parts: ContentPart[] = m.content ? [{ type: 'text', text: m.content }] : []
      for (const url of images) parts.push({ type: 'image_url', image_url: { url } })
      return { role: 'user', content: parts }
    })
    // sin mensaje de texto: enviar solo las imágenes como mensaje de usuario
    if (!built.some((m) => Array.isArray(m.content))) {
      built = [
        ...built,
        {
          role: 'user',
          content: images.map((url) => ({ type: 'image_url', image_url: { url } })),
        },
      ]
    }
  }
  // 1) z-ai (entorno de desarrollo)
  //    Reintenta 1 vez con config fresca si el token cacheado caducó (rotación).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const zai = await getZai()
      const completion = multimodal
        ? await zai.chat.completions.createVision({
            messages: built,
            thinking: { type: 'disabled' },
          })
        : await zai.chat.completions.create({
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
  // 2) Proveedor OpenAI-compatible (producción); con imágenes usa la
  //    cadena de visión (VISION_* → AI_VISION_MODEL → autodetección)
  const cfg = openAiConfig()
  if (cfg) {
    if (multimodal) return openAiVision(built)
    return openAiChat(built, cfg.model, cfg)
  }
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
  // 2) Proveedor OpenAI-compatible: misma cadena de visión que el chat
  //    (VISION_* → AI_VISION_MODEL → autodetección en catálogo)
  return openAiVision([
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ])
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
  // 2) Proveedor de voz dedicado (VOICE_*): ej. Groq — whisper-large-v3
  //    (OpenRouter no tiene ASR; VOICE_* permite separar proveedor de voz)
  const voiceBase = process.env.VOICE_BASE_URL?.replace(/\/+$/, '')
  const voiceKey = process.env.VOICE_API_KEY
  if (voiceBase && voiceKey) {
    const asrModel = process.env.VOICE_MODEL || process.env.AI_ASR_MODEL || 'whisper-large-v3'
    const form = new FormData()
    form.append(
      'file',
      new Blob([Buffer.from(fileBase64, 'base64')], { type: 'audio/wav' }),
      'audio.wav'
    )
    form.append('model', asrModel)
    const res = await fetch(`${voiceBase}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${voiceKey}` },
      body: form,
    })
    if (res.ok) {
      const json = (await res.json()) as { text?: string }
      const text = (json?.text ?? '').trim()
      if (text) return text
      throw new Error('La transcripción llegó vacía')
    }
    throw new Error(`IA: el proveedor de voz respondió ${res.status}. Revisa VOICE_API_KEY en Vercel.`)
  }
  // 3) Fallback: proveedor general (AI_*) con /audio/transcriptions
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
