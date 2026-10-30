// ─────────────────────────────────────────────────────────────────
// Bolsillo — Store global (zustand)
// ─────────────────────────────────────────────────────────────────
'use client'

import { create } from 'zustand'
import { api } from './api'
import type { Category, OverviewDTO, Tag, TxDialogState, TxDTO, View } from './types'

type InstallPromptEvent = Event & { prompt: () => Promise<void> }

interface AppState {
  view: View
  setView: (v: View) => void

  overview: OverviewDTO | null
  loadingOverview: boolean
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
  refreshOverview: async () => {
    if (get().loadingOverview) return
    set({ loadingOverview: true })
    try {
      const overview = await api.overview()
      set({ overview })
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
