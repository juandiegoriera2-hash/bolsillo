// ─────────────────────────────────────────────────────────────────
// Bolsillo — Grabación de voz → WAV 16 kHz mono (para ASR)
// ─────────────────────────────────────────────────────────────────
'use client'

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

/** Convierte el blob de MediaRecorder (webm/opus) a WAV mono 16 kHz en base64 */
export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const targetRate = 16000
    const length = Math.max(1, Math.ceil(decoded.duration * targetRate))
    const offline = new OfflineAudioContext(1, length, targetRate)
    // mezclar a mono
    let mono: Float32Array
    if (decoded.numberOfChannels === 1) {
      mono = decoded.getChannelData(0).slice()
    } else {
      const ch0 = decoded.getChannelData(0)
      const ch1 = decoded.getChannelData(1)
      mono = new Float32Array(ch0.length)
      for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) / 2
    }
    const buf = offline.createBuffer(1, mono.length, decoded.sampleRate)
    buf.copyToChannel(mono, 0)
    const src = offline.createBufferSource()
    src.buffer = buf
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    const wav = encodeWav(rendered.getChannelData(0), targetRate)
    // base64
    const bytes = new Uint8Array(wav)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  } finally {
    ctx.close().catch(() => {})
  }
}
