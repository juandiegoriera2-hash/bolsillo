'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { blobToWavBase64 } from '../wav'
import { compressImage } from '../img'
import { useAppStore } from '../store'
import { ViewHeader } from '../parts'
import { cn } from '@/lib/utils'
import { Bot, Check, ImagePlus, Loader2, Mic, Send, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  images?: string[]
  results?: Array<{ ok: boolean; message: string }>
  pending?: boolean
}

const SUGGESTIONS = [
  'Gasté 4.500 Bs en almuerzo',
  'Recibí 50$ de freelance en Zinli',
  'Créame un presupuesto de 60$ para café',
  'Cuánto he gastado esta semana',
]

const MAX_IMAGES = 4

let mid = 0
const nid = () => `m${Date.now()}_${mid++}`

export function AssistantView() {
  const { refreshOverview } = useAppStore()
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '¡Hola! 👋 Soy tu asistente financiero. Registra movimientos con texto o voz — y ahora también puedes **pegar o adjuntar capturas** de tu banco o de otra app: las leo y registro todos los movimientos yo solo.\n\nPrueba: *"gasté 4.500 en almuerzo"* o pega una captura 📷',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<string[]>([])
  const [imgBusy, setImgBusy] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, images])

  useEffect(() => {
    if (recording) {
      setRecordTime(0)
      timerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [recording])

  // ── capturas: adjuntar / pegar / arrastrar ──────────────────
  const addImages = async (files: Array<File | Blob | null>) => {
    const imgs = files.filter((f): f is File | Blob => !!f && (f as File).type?.startsWith('image/'))
    if (!imgs.length) return
    setError(null)
    const free = MAX_IMAGES - images.length
    if (free <= 0) {
      setError(`Máximo ${MAX_IMAGES} capturas por mensaje. Envíalas en dos mensajes.`)
      return
    }
    setImgBusy(true)
    try {
      const compressed = await Promise.all(
        imgs.slice(0, free).map((f) => compressImage(f).catch(() => null))
      )
      const ok = compressed.filter((c): c is string => !!c)
      if (!ok.length) {
        setError('No pude leer esas imágenes. Prueba con PNG o JPG.')
        return
      }
      setImages((prev) => [...prev, ...ok].slice(0, MAX_IMAGES))
    } finally {
      setImgBusy(false)
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
    if (files.some(Boolean)) {
      e.preventDefault()
      addImages(files)
    }
  }

  const send = async (text: string, attached: string[] = []) => {
    const msg = text.trim()
    if ((!msg && attached.length === 0) || busy) return
    setInput('')
    setImages([])
    setError(null)
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      {
        id: nid(),
        role: 'user',
        text: msg || '📷 Regístrame estos movimientos',
        images: attached.length ? attached : undefined,
      },
    ])
    try {
      const res = await api.chat(msg, attached)
      setMessages((prev) => [
        ...prev,
        { id: nid(), role: 'assistant', text: res.reply, results: res.results },
      ])
      if (res.results?.some((r) => r.ok)) await refreshOverview()
    } catch (e) {
      setError((e as Error).message)
      setMessages((prev) => [
        ...prev,
        { id: nid(), role: 'assistant', text: '⚠️ No pude procesar el mensaje. Intenta de nuevo.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  const startRecording = async () => {
    if (recording || busy) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 1200) {
          setError('Grabación muy corta. Mantén presionado y habla claro.')
          return
        }
        setBusy(true)
        setMessages((prev) => [...prev, { id: nid(), role: 'user', text: '🎙️ …', pending: true }])
        try {
          const base64 = await blobToWavBase64(blob)
          const res = await api.voice(base64)
          setMessages((prev) =>
            prev
              .map((m) => (m.pending ? { ...m, text: res.transcript, pending: false } : m))
              .concat({
                id: nid(),
                role: 'assistant' as const,
                text: res.reply,
                results: res.results,
              })
          )
          if (res.results?.some((r) => r.ok)) await refreshOverview()
        } catch (e) {
          setMessages((prev) => prev.filter((m) => !m.pending))
          setError((e as Error).message)
        } finally {
          setBusy(false)
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setError('No tengo acceso al micrófono. Revisa los permisos del navegador.')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <div
      className="pb-4 flex flex-col h-[calc(100dvh-11.5rem)] md:h-[calc(100dvh-7rem)]"
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        addImages(Array.from(e.dataTransfer?.files ?? []))
      }}
    >
      <ViewHeader
        title="Asistente financiero"
        subtitle="Texto, voz o capturas de pantalla — pega (Ctrl+V) y las registro yo"
      />

      {/* mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-4 px-0.5 py-2">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] md:max-w-[75%]', m.pending && 'opacity-60')}>
              {m.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1 ml-1">
                  <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                    <Bot size={12} className="text-emerald-950" />
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground">Bolsillo IA</span>
                </div>
              )}
              {m.images && m.images.length > 0 && (
                <div className={cn('flex gap-1.5 mb-1.5 flex-wrap', m.role === 'user' && 'justify-end')}>
                  {m.images.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Captura ${i + 1}`}
                      className="h-16 w-16 rounded-lg object-cover border border-white/15"
                    />
                  ))}
                </div>
              )}
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-emerald-400 text-emerald-950 font-medium rounded-br-md'
                    : 'glass rounded-bl-md'
                )}
              >
                {m.text}
              </div>
              {m.results && m.results.length > 0 && (
                <div className="mt-1.5 space-y-1 max-h-44 overflow-y-auto pr-1">
                  {m.results.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium mr-1',
                        r.ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
                      )}
                    >
                      {r.ok ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0" />}
                      <span>{r.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '240ms' }} />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-400 px-1 mb-2">{error}</p>}

      {/* sugerencias */}
      {messages.length <= 1 && !busy && (
        <div className="flex flex-wrap gap-2 mb-2 px-0.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-emerald-400/25 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-200/90 hover:bg-emerald-400/12 transition-colors"
            >
              <Sparkles size={11} className="inline mr-1 -mt-0.5" />
              {s}
            </button>
          ))}
        </div>
      )}

      {/* capturas adjuntas */}
      {(images.length > 0 || imgBusy) && (
        <div className="flex gap-2 mb-2 flex-wrap px-0.5">
          {images.map((src, i) => (
            <div key={i} className="relative">
              <img
                src={src}
                alt={`Captura ${i + 1} adjunta`}
                className="h-20 w-20 rounded-xl object-cover border border-white/15"
              />
              <button
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-400 transition-colors"
                aria-label={`Quitar captura ${i + 1}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {imgBusy && (
            <div className="h-20 w-20 rounded-xl border border-white/15 glass flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-emerald-300" />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground self-end pb-0.5">
            {images.length}/{MAX_IMAGES} · la IA leerá todos los movimientos
          </p>
        </div>
      )}

      {/* input */}
      <div className="glass rounded-2xl p-2 flex items-end gap-1.5">
        {recording ? (
          <div className="flex-1 flex items-center gap-3 px-2 h-10">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            <span className="tnum text-sm font-medium text-rose-300">
              Grabando… {String(Math.floor(recordTime / 60)).padStart(2, '0')}:
              {String(recordTime % 60).padStart(2, '0')}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 border-rose-400/40 text-rose-300 hover:bg-rose-400/10"
              onClick={stopRecording}
            >
              <Square size={12} className="mr-1" /> Detener y enviar
            </Button>
          </div>
        ) : (
          <>
            <Textarea
              placeholder='Escribe, habla o pega una captura (Ctrl+V)…'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input, images)
                }
              }}
              rows={1}
              className="flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm min-h-10 max-h-32"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addImages(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={busy || images.length >= MAX_IMAGES}
              className={cn(
                'rounded-xl h-10 w-10 text-muted-foreground hover:text-emerald-300 hover:bg-emerald-400/10',
                images.length > 0 && 'text-emerald-300'
              )}
              aria-label="Adjuntar captura"
            >
              <ImagePlus size={18} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={startRecording}
              disabled={busy}
              className="rounded-xl h-10 w-10 text-muted-foreground hover:text-emerald-300 hover:bg-emerald-400/10"
              aria-label="Hablar"
            >
              <Mic size={18} />
            </Button>
            <Button
              size="icon"
              onClick={() => send(input, images)}
              disabled={(!input.trim() && images.length === 0) || busy}
              className="rounded-xl h-10 w-10 bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
              aria-label="Enviar"
            >
              <Send size={16} />
            </Button>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2 px-4">
        Pega (Ctrl+V) o adjunta 📷 capturas de tu banco y registro todos los movimientos — con
        categoría, fecha y hora. Tus imágenes no se guardan.
      </p>
    </div>
  )
}
