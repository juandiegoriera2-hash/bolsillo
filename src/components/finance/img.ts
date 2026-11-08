// ─────────────────────────────────────────────────────────────────
// Bolsillo — Compresión de imágenes en el cliente
// Las capturas del banco se re-escalan (máx 1400px de lado mayor) y se
// re-codifican en JPEG antes de enviarlas a la IA: una captura PNG de
// 2MB queda en ~200-400KB, suficiente para que el modelo de visión
// lea el texto y liviana para el viaje por la red.
// ─────────────────────────────────────────────────────────────────

export async function compressImage(
  file: File | Blob,
  maxSide = 1400,
  quality = 0.82
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('No pude leer la imagen'))
    fr.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Formato de imagen no soportado'))
    el.src = dataUrl
  })
  if (!img.width || !img.height) throw new Error('La imagen está vacía')
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  // fondo blanco (por si la imagen tiene transparencia) + re-encode JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
