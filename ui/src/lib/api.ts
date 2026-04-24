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
  piece_roles: Record<string, string>;
  created_at: string | null;
}

export interface FurniturePiece {
  id: string;
  layer: string;
  role: string;
  vertices: [number, number][];
  width: number;
  height: number;
  depth: number;
  quantity: number;
}

export interface FurnitureDetail extends FurnitureItem {
  material_thickness: number;
  pieces: FurniturePiece[];
}

interface RawFurnitureDetail {
  furniture_id: string;
  name: string;
  thumbnail_url: string;
  material_thickness: number;
  version: number;
  pieces: FurniturePiece[];
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

  getFurniture: async (id: string): Promise<FurnitureDetail> => {
    const raw = await req<RawFurnitureDetail>(`/furniture/${id}`);
    const layers: string[] = [];
    const piece_roles: Record<string, string> = {};
    for (const p of raw.pieces) {
      if (!layers.includes(p.layer)) layers.push(p.layer);
      if (!(p.layer in piece_roles)) piece_roles[p.layer] = p.role ?? "";
    }
    return {
      furniture_id: raw.furniture_id,
      name: raw.name,
      thumbnail_url: raw.thumbnail_url,
      contours_count: raw.pieces.length,
      layers,
      piece_roles,
      created_at: raw.created_at,
      material_thickness: raw.material_thickness,
      pieces: raw.pieces,
    };
  },

  deleteFurniture: (id: string) =>
    req<{ ok: boolean }>(`/furniture/${id}`, { method: "DELETE" }),

  updateFurnitureRoles: (id: string, roles: Record<string, string>) =>
    req<{ ok: boolean }>(`/furniture/${id}/roles`, {
      method: "PUT",
      body: JSON.stringify({ roles }),
    }),
};

