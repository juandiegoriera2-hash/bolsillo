/* Bolsillo — Service Worker
 * Estrategia dev-safe:
 *  - Navegación: network-first con fallback a caché (evita contenido viejo en dev)
 *  - Estáticos e íconos: stale-while-revalidate
 *  - GET /api: network-first con caché de respaldo — permite abrir la app
 *    sin conexión con la última copia de los datos (modo offline)
 *  - POST/PATCH/DELETE /api: siempre red (la cola offline los reintenta)
 */
const CACHE = 'bolsillo-v3'
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // GET /api: network-first con respaldo en caché (modo offline).
  // Solo consultas de lectura (sin action/refresh): las de refrescar tasas
  // o desbloquear PIN no se sirven nunca desde caché.
  if (url.pathname.startsWith('/api/')) {
    const noCache = url.searchParams.has('action') || url.searchParams.has('deep') || url.searchParams.has('ai') || url.pathname.startsWith('/api/auth')
    if (noCache) return
    event.respondWith(
      fetch(req)
        .then((res) => {
          // solo se cachean respuestas OK: un 401 (candado PIN) o error
          // cacheado dejaría la app bloqueada al abrir sin conexión
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() =>
          caches.match(req).then((m) => {
            if (m && m.ok) {
              // servido desde caché: marcarlo para que la app sepa que está
              // viendo datos guardados (sin conexión real)
              const headers = new Headers(m.headers)
              headers.set('X-Bolsillo-Offline', '1')
              return new Response(m.body, { status: m.status, statusText: m.statusText, headers })
            }
            return new Response(JSON.stringify({ error: 'Sin conexión' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', 'X-Bolsillo-Offline': '1' },
            })
          }),
        )
    )
    return
  }

  if (req.mode === 'navigate') {
    // network-first
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/')))
    )
    return
  }

  // estáticos: stale-while-revalidate
  const isAsset = url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.webmanifest')
  if (isAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})
// v3 — no cachea respuestas de error (401 PIN) y sirve solo caché OK sin conexión
