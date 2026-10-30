/* Bolsillo — Service Worker
 * Estrategia dev-safe:
 *  - Navegación: network-first con fallback a caché (evita contenido viejo en dev)
 *  - Estáticos e íconos: stale-while-revalidate
 *  - /api: siempre red (datos frescos)
 */
const CACHE = 'bolsillo-v1'
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
  if (url.pathname.startsWith('/api/')) return // datos siempre frescos

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
