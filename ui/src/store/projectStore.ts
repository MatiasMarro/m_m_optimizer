// Copyright (c) 2024-2026 Matías Marro. All rights reserved.
// m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
import { create } from "zustand";
import type { FurnitureSpec, PipelineResponse } from "@/lib/types";
import { computeSheetEfficiency } from "@/lib/nestingUtils";

interface ProjectState {
  spec: FurnitureSpec;
  result: PipelineResponse | null;
  loading: boolean;
  error: string | null;
  setSpec: (patch: Partial<FurnitureSpec>) => void;
  setResult: (r: PipelineResponse | null) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  movePiece: (
    fromSheetIdx: number,
    pieceIdx: number,
    toSheetIdx: number,
    x: number,
    y: number,
  ) => void;
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

export const useProject = create<ProjectState>((set) => ({
  spec: defaultSpec,
  result: null,
  loading: false,
  error: null,
  setSpec: (patch) => set((s) => ({ spec: { ...s.spec, ...patch } })),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
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

      const next = sheets.map((s) => ({ ...s, placed: [...s.placed] }));
      const [moved] = next[fromSheetIdx].placed.splice(pieceIdx, 1);
      next[toSheetIdx].placed.push({ ...moved, x, y });

      const recomputed = next.map((s, i) =>
        i === fromSheetIdx || i === toSheetIdx
          ? { ...s, efficiency: computeSheetEfficiency(s) }
          : s,
      );

      return {
        ...state,
        result: {
          ...state.result,
          layout: { ...state.result.layout, sheets_used: recomputed },
        },
      };
    }),
  reset: () => set({ spec: defaultSpec, result: null, error: null }),
}));
