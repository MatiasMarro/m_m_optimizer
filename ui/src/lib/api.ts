import type { PipelineRequest, PipelineResponse } from "./types";

export interface OffcutStock {
  id: string;
  width: number;
  height: number;
  thickness: number;
  is_offcut: boolean;
}

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: boolean }>("/health"),

  runPipeline: (payload: PipelineRequest) =>
    req<PipelineResponse>("/pipeline/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listOffcuts: () => req<OffcutStock[]>("/inventory/offcuts"),
};
