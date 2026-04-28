// file: lib/stores/whatIfStore.ts
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhatIfStore {
  /** Whether the What-If modal is currently open. */
  open: boolean;
  /** Whether a what-if analysis is actively running (user clicked "Run Analysis"). */
  active: boolean;
  /** Major being explored, or null. */
  major: string | null;
  /** Minor being explored, or null. */
  minor: string | null;
  /** Concentration being explored, or null. */
  concentration: string | null;

  // Modal control
  openModal: () => void;
  closeModal: () => void;

  // Analysis lifecycle
  /** Set active=true and close the modal. Selections are preserved. */
  activate: () => void;
  /** Set active=false. Selections are preserved (user can re-open and adjust). */
  deactivate: () => void;

  // Selections
  setMajor: (major: string | null) => void;
  setMinor: (minor: string | null) => void;
  setConcentration: (concentration: string | null) => void;

  /** Clear all state: deactivate, close modal, clear all selections. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWhatIfStore = create<WhatIfStore>((set) => ({
  open:          false,
  active:        false,
  major:         null,
  minor:         null,
  concentration: null,

  openModal:  () => set({ open: true }),
  closeModal: () => set({ open: false }),

  activate:   () => set({ active: true, open: false }),
  deactivate: () => set({ active: false }),

  setMajor:         (major)         => set({ major }),
  setMinor:         (minor)         => set({ minor }),
  setConcentration: (concentration) => set({ concentration }),

  reset: () => set({
    open: false, active: false, major: null, minor: null, concentration: null,
  }),
}));
