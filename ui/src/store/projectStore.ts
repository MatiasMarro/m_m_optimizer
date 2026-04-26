// Copyright (c) 2024-2026 Matías Marro. All rights reserved.
// m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
import { create } from "zustand";
import type { Cost, FurnitureSpec, PipelineResponse, SheetUsage } from "@/lib/types";
import { computeSheetEfficiency } from "@/lib/nestingUtils";
import { api } from "@/lib/api";

export interface InventoryComparison {
  fileName: string;
  sheetsWithout: number;
  sheetsWith: number;
  offcutsUsed: number;
  savingsArs: number;
  savingsPct: number;
  // Layouts completos para comparación visual side-by-side. Pueden ser null si
  // el optimizador no devolvió la versión sin inventario.
  layoutWithout?: SheetUsage[] | null;
  layoutWith?: SheetUsage[] | null;
}

interface MoveHistoryEntry {
  fromSheetIdx: number;
  toSheetIdx: number;
  pieceUid: string;
  prevX: number;
  prevY: number;
}

interface ProjectState {
  spec: FurnitureSpec;
  result: PipelineResponse | null;
  loading: boolean;
  error: string | null;
  inventoryComparison: InventoryComparison | null;
  activeProjectName: string | null;
  costsMayBeStale: boolean;
  moveHistory: MoveHistoryEntry[];
  setSpec: (patch: Partial<FurnitureSpec>) => void;
  setResult: (r: PipelineResponse | null) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  setInventoryComparison: (c: InventoryComparison | null) => void;
  setActiveProjectName: (name: string | null) => void;
  setCostsMayBeStale: (b: boolean) => void;
  movePiece: (
    fromSheetIdx: number,
    pieceIdx: number,
    toSheetIdx: number,
    x: number,
    y: number,
  ) => void;
  undoMove: () => boolean;
  recomputeCosts: () => Promise<{ ok: true; cost: Cost } | { ok: false; error: string }>;
  reset: () => void;
}

const defaultSpec: FurnitureSpec = {
  tipo: "cabinet",
  ancho: 600,
  alto: 720,
  profundidad: 400,
  espesor: 18,
  num_estantes: 2,
  con_fondo: true,
};

const STORAGE_KEY = "mm:projectState:v1";

interface PersistedShape {
  spec?: FurnitureSpec;
  result?: PipelineResponse | null;
  activeProjectName?: string | null;
  inventoryComparison?: InventoryComparison | null;
  costsMayBeStale?: boolean;
}

function loadPersisted(): PersistedShape {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedShape;
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

export const useProject = create<ProjectState>((set, get) => ({
  spec: persisted.spec ?? defaultSpec,
  result: persisted.result ?? null,
  loading: false,
  error: null,
  inventoryComparison: persisted.inventoryComparison ?? null,
  activeProjectName: persisted.activeProjectName ?? null,
  costsMayBeStale: persisted.costsMayBeStale ?? false,
  moveHistory: [],
  setSpec: (patch) => set((s) => ({ spec: { ...s.spec, ...patch } })),
  setResult: (result) => set({ result, costsMayBeStale: false, moveHistory: [] }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setInventoryComparison: (inventoryComparison) => set({ inventoryComparison }),
  setActiveProjectName: (activeProjectName) => set({ activeProjectName }),
  setCostsMayBeStale: (costsMayBeStale) => set({ costsMayBeStale }),
  movePiece: (fromSheetIdx, pieceIdx, toSheetIdx, x, y) =>
    set((state) => {
      if (!state.result) return state;
      const sheets = state.result.layout.sheets_used;
      if (
        fromSheetIdx < 0 ||
        fromSheetIdx >= sheets.length ||
        toSheetIdx < 0 ||
        toSheetIdx >= sheets.length
      )
        return state;
      const fromPlaced = sheets[fromSheetIdx].placed;
      if (pieceIdx < 0 || pieceIdx >= fromPlaced.length) return state;

      const orig = fromPlaced[pieceIdx];
      const next = sheets.map((s) => ({ ...s, placed: [...s.placed] }));
      const [moved] = next[fromSheetIdx].placed.splice(pieceIdx, 1);
      next[toSheetIdx].placed.push({ ...moved, x, y });

      const recomputed = next.map((s, i) =>
        i === fromSheetIdx || i === toSheetIdx
          ? { ...s, efficiency: computeSheetEfficiency(s) }
          : s,
      );

      const pieceUid = `${orig.piece_name}@${orig.x},${orig.y}`;
      const history = [
        ...state.moveHistory.slice(-19),
        {
          fromSheetIdx,
          toSheetIdx,
          pieceUid,
          prevX: orig.x,
          prevY: orig.y,
        },
      ];

      return {
        ...state,
        moveHistory: history,
        result: {
          ...state.result,
          layout: { ...state.result.layout, sheets_used: recomputed },
        },
      };
    }),
  undoMove: () => {
    const state = get();
    if (!state.result) return false;
    const last = state.moveHistory[state.moveHistory.length - 1];
    if (!last) return false;
    const sheets = state.result.layout.sheets_used;
    const toSheet = sheets[last.toSheetIdx];
    if (!toSheet) return false;
    // El movimiento dejó la pieza al final del placed[] del sheet destino
    const idxInTo = toSheet.placed.length - 1;
    const moved = toSheet.placed[idxInTo];
    if (!moved) return false;

    const next = sheets.map((s) => ({ ...s, placed: [...s.placed] }));
    next[last.toSheetIdx].placed.splice(idxInTo, 1);
    next[last.fromSheetIdx].placed.push({
      ...moved,
      x: last.prevX,
      y: last.prevY,
    });
    const recomputed = next.map((s, i) =>
      i === last.fromSheetIdx || i === last.toSheetIdx
        ? { ...s, efficiency: computeSheetEfficiency(s) }
        : s,
    );

    set({
      moveHistory: state.moveHistory.slice(0, -1),
      result: {
        ...state.result,
        layout: { ...state.result.layout, sheets_used: recomputed },
      },
    });
    return true;
  },
  recomputeCosts: async () => {
    const state = get();
    if (!state.result) return { ok: false, error: "No hay resultado activo" };
    try {
      const cost = await api.recomputeCosts(state.result.pieces, state.result.layout);
      const current = get().result;
      if (!current) return { ok: false, error: "Resultado descartado durante el cálculo" };
      set({
        result: { ...current, costo: cost },
        costsMayBeStale: false,
      });
      return { ok: true, cost };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
  reset: () =>
    set({
      spec: defaultSpec,
      result: null,
      error: null,
      inventoryComparison: null,
      activeProjectName: null,
      moveHistory: [],
    }),
}));

// ── Persistencia automática en localStorage ──────────────────────────────────
if (typeof window !== "undefined") {
  let saveTimer: number | null = null;
  useProject.subscribe((state) => {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        const payload: PersistedShape = {
          spec: state.spec,
          result: state.result,
          activeProjectName: state.activeProjectName,
          inventoryComparison: state.inventoryComparison,
          costsMayBeStale: state.costsMayBeStale,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Cuota llena u otro error: ignorar (el estado sigue en memoria)
      }
    }, 250);
  });

  // Sync entre pestañas: si otra pestaña actualiza el state, hidratar
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const next = JSON.parse(e.newValue) as PersistedShape;
      useProject.setState({
        spec: next.spec ?? defaultSpec,
        result: next.result ?? null,
        activeProjectName: next.activeProjectName ?? null,
        inventoryComparison: next.inventoryComparison ?? null,
        costsMayBeStale: next.costsMayBeStale ?? false,
      });
    } catch {
      // ignore
    }
  });
}
