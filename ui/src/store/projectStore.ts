import { create } from "zustand";
import type { FurnitureSpec, PipelineResponse } from "@/lib/types";

interface ProjectState {
  spec: FurnitureSpec;
  result: PipelineResponse | null;
  loading: boolean;
  error: string | null;
  setSpec: (patch: Partial<FurnitureSpec>) => void;
  setResult: (r: PipelineResponse | null) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
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
  reset: () => set({ spec: defaultSpec, result: null, error: null }),
}));
