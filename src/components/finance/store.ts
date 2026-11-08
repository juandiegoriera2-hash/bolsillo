// ─────────────────────────────────────────────────────────────────
// Bolsillo — Store global (zustand)
// Incluye modo offline: la última copia buena de los datos se guarda
// en el teléfono (localStorage) para poder abrir la app sin conexión,
// y un estado `offline` que la UI usa para avisar sin molestar.
// ─────────────────────────────────────────────────────────────────
'use client'

import { create } from 'zustand'
import { api, NetworkError } from './api'
import type { Category, OverviewDTO, Tag, TxDialogState, TxDTO, View } from './types'

type InstallPromptEvent = Event & { prompt: () => Promise<void> }

const OVERVIEW_CACHE_KEY = 'bolsillo.overview.v1'

function saveOverviewCache(o: OverviewDTO) {
  try {
    localStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify(o))
  } catch {
    /* almacenamiento lleno: ignorar */
  }
}

function loadOverviewCache(): OverviewDTO | null {
  try {
    const raw = localStorage.getItem(OVERVIEW_CACHE_KEY)
    return raw ? (JSON.parse(raw) as OverviewDTO) : null
  } catch {
    return null
  }
}

interface AppState {
  view: View
  setView: (v: View) => void

  overview: OverviewDTO | null
  loadingOverview: boolean
  /** Sin conexión al servidor (confirmado: la última petición falló por red) */
  offline: boolean
  setOffline: (v: boolean) => void
  refreshOverview: () => Promise<void>

  categories: Category[]
  tags: Tag[]
  metaLoaded: boolean
  refreshMeta: () => Promise<void>

  txDialog: TxDialogState
  openTxDialog: (opts?: { edit?: TxDTO | null; prefill?: TxDialogState['prefill'] }) => void
  closeTxDialog: () => void

  // PWA
  installEvent: InstallPromptEvent | null
  setInstallEvent: (e: InstallPromptEvent | null) => void
  canInstall: boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'dashboard',
  setView: (v) => set({ view: v }),

  overview: null,
  loadingOverview: false,
  offline: false,
  setOffline: (v) => set({ offline: v }),
  refreshOverview: async () => {
    if (get().loadingOverview) return
    set({ loadingOverview: true })
    try {
      const overview = await api.overview()
      // NOTA: el estado `offline` lo gestionan los eventos bolsillo:stale /
      // bolsillo:fresh (una respuesta puede venir del caché del Service
      // Worker aunque la red esté caída, así que éxito ≠ online)
      set({ overview })
      // guardar copia local para poder abrir la app sin conexión
      if (typeof window !== 'undefined') saveOverviewCache(overview)
    } catch (e) {
      if (e instanceof NetworkError) {
        // sin conexión: usar la última copia guardada en el teléfono
        const cached = typeof window !== 'undefined' ? loadOverviewCache() : null
        set({ offline: true, ...(cached ? { overview: cached } : {}) })
      } else {
        throw e
      }
    } finally {
      set({ loadingOverview: false })
    }
  },

  categories: [],
  tags: [],
  metaLoaded: false,
  refreshMeta: async () => {
    const { categories, tags } = await api.meta()
    set({ categories, tags, metaLoaded: true })
  },

  txDialog: { open: false },
  openTxDialog: (opts) =>
    set({ txDialog: { open: true, edit: opts?.edit ?? null, prefill: opts?.prefill ?? null } }),
  closeTxDialog: () => set({ txDialog: { open: false, edit: null, prefill: null } }),

  installEvent: null,
  setInstallEvent: (e) => set({ installEvent: e, canInstall: !!e }),
  canInstall: false,
}))
