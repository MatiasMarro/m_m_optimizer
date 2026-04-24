// Copyright (c) 2024-2026 Matías Marro. All rights reserved.
// m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
import type {
  CostingConfig,
  FurnitureSpec,
  PipelineRequest,
  PipelineResponse,
  ProjectMeta,
  SavedProject,
} from "./types";

export interface OffcutStock {
  id: string;
  width: number;
  height: number;
  thickness: number;
  is_offcut: boolean;
}

export interface FurnitureItem {
  furniture_id: string;
  name: string;
  thumbnail_url: string;
  contours_count: number;
  layers: string[];
  created_at: string | null;
}

export interface FurnitureImportResponse {
  furniture_id: string;
  name: string;
  thumbnail_url: string;
  dxf_filename: string;
  contours_count: number;
  layers: string[];
  pieces_preview: unknown[];
  uploaded_images_count: number;
  warnings: string[];
  created_at: string | null;
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

  saveProject: (nombre: string, spec: FurnitureSpec, result: PipelineResponse) =>
    req<ProjectMeta>("/projects", {
      method: "POST",
      body: JSON.stringify({ nombre, spec, result }),
    }),

  listProjects: () => req<ProjectMeta[]>("/projects"),

  getProject: (id: string) => req<SavedProject>(`/projects/${id}`),

  deleteProject: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  getConfig: () => req<CostingConfig>("/config/costing"),

  putConfig: (cfg: CostingConfig) =>
    req<CostingConfig>("/config/costing", {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),

  // ── furniture (multipart — sin Content-Type fijo para que el browser setee el boundary) ──

  importFurniture: async (
    name: string,
    thickness: number,
    dxfFile: File,
  ): Promise<FurnitureImportResponse> => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("material_thickness", String(thickness));
    fd.append("dxf_file", dxfFile, dxfFile.name);
    const res = await fetch(`${BASE}/furniture/import`, { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return res.json() as Promise<FurnitureImportResponse>;
  },

  listFurniture: () => req<FurnitureItem[]>("/furniture"),

  deleteFurniture: (id: string) =>
    req<{ ok: boolean }>(`/furniture/${id}`, { method: "DELETE" }),
};

