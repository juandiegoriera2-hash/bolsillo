'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { blobToWavBase64 } from '../wav'
import { useAppStore } from '../store'
import { ViewHeader } from '../parts'
import { cn } from '@/lib/utils'
import { Bot, Check, Mic, Send, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  results?: Array<{ ok: boolean; message: string }>
  pending?: boolean
}

const SUGGESTIONS = [
  'Gasté 4.500 Bs en almuerzo',
  'Recibí 50$ de freelance en Zinli',
  'Créame un presupuesto de 60$ para café',
  'Cuánto he gastado esta semana',
  'Me pagaron la quincena 155.000 Bs',
]

let mid = 0
const nid = () => `m${Date.now()}_${mid++}`

export function AssistantView() {
  const { refreshOverview } = useAppStore()
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '¡Hola! 👋 Soy tu asistente financiero. Registra movimientos con lenguaje natural o pregúntame sobre tus finanzas.\n\nPrueba: *"gasté 4.500 en almuerzo"* o *"cuánto he gastado en comida"*',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

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

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    setInput('')
    setError(null)
    setBusy(true)
    setMessages((prev) => [...prev, { id: nid(), role: 'user', text: msg }])
    try {
      const res = await api.chat(msg)
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
    <div className="pb-4 flex flex-col h-[calc(100dvh-11.5rem)] md:h-[calc(100dvh-7rem)]">
      <ViewHeader
        title="Asistente financiero"
        subtitle="Registra ingresos y egresos con lenguaje natural — texto o voz"
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
                <div className="mt-1.5 space-y-1">
                  {m.results.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium',
                        r.ok ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
                      )}
                    >
                      {r.ok ? <Check size={12} /> : <X size={12} />}
                      {r.message}
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

      {/* input */}
      <div className="glass rounded-2xl p-2 flex items-end gap-2">
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
              placeholder='Ej: "gasté 450 en mercado" o "cuánto debo"'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              className="flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm min-h-10 max-h-32"
            />
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
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              className="rounded-xl h-10 w-10 bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
              aria-label="Enviar"
            >
              <Send size={16} />
            </Button>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2 px-4">
        El asistente conoce tus cuentas, categorías y tasas del día. Los registros aparecen con la etiqueta “IA”.
      </p>
    </div>
  )
}
