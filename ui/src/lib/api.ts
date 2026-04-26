// Copyright (c) 2024-2026 Matías Marro. All rights reserved.
// m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
import type {
  Cost,
  CostingConfig,
  CostingOverrides,
  EstimateResponse,
  FurnitureSpec,
  HardwareItem,
  Layout,
  Piece,
  PipelineRequest,
  PipelineResponse,
  ProjectMeta,
  ProjectMetaPatch,
  SavedProject,
} from "./types";

export interface OptimizeImportedRequest {
  use_inventory?: boolean;
  horas_mo?: number | null;
  compare_inventory?: boolean;
}

export interface OptimizeImportedSummary {
  sheets_without?: number;
  sheets_with?: number;
  offcuts_used?: number;
  savings_ars?: number;
  savings_pct?: number;
  pieces_count?: number;
  sheets_used?: number;
}

export interface OptimizeImportedResponse {
  compare: boolean;
  result?: PipelineResponse;
  without_inventory?: PipelineResponse;
  with_inventory?: PipelineResponse;
  summary: OptimizeImportedSummary;
}

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
  layer_depths: Record<string, number>;
  layer_depths_override: Record<string, number>;
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
  layer_depths_override?: Record<string, number>;
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

export interface AIConfigStatus {
  has_anthropic_api_key: boolean;
  masked_key: string | null;
  model: string;
}

export interface Crv3dMetadata {
  aspire_version: string | null;
  material_width_mm: number | null;
  material_height_mm: number | null;
  material_thickness_mm: number | null;
  layer_names: string[];
}

export class Crv3dNotSupportedError extends Error {
  metadata: Crv3dMetadata;
  previewGifBase64: string | null;
  constructor(message: string, metadata: Crv3dMetadata, previewGifBase64: string | null) {
    super(message);
    this.name = "Crv3dNotSupportedError";
    this.metadata = metadata;
    this.previewGifBase64 = previewGifBase64;
  }
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

  recomputeCosts: (
    pieces: Piece[],
    layout: Layout,
    opts: {
      horas_mo?: number | null;
      herrajes?: HardwareItem[];
      overrides?: CostingOverrides;
    } = {},
  ) =>
    req<Cost>("/pipeline/recompute_costs", {
      method: "POST",
      body: JSON.stringify({
        pieces,
        layout,
        horas_mo: opts.horas_mo ?? null,
        herrajes: opts.herrajes ?? [],
        overrides: opts.overrides ?? null,
      }),
    }),

  estimatePipeline: (furniture: FurnitureSpec) =>
    req<EstimateResponse>("/pipeline/estimate", {
      method: "POST",
      body: JSON.stringify({ furniture }),
    }),

  listOffcuts: () => req<OffcutStock[]>("/inventory/offcuts"),

  addOffcut: (ancho: number, alto: number) =>
    req<{ id: string; ancho: number; alto: number; usado: boolean }>("/inventory/offcuts", {
      method: "POST",
      body: JSON.stringify({ ancho, alto }),
    }),

  saveProject: (nombre: string, spec: FurnitureSpec, result: PipelineResponse) =>
    req<ProjectMeta>("/projects", {
      method: "POST",
      body: JSON.stringify({ nombre, spec, result }),
    }),

  listProjects: () => req<ProjectMeta[]>("/projects"),

  getProject: (id: string) => req<SavedProject>(`/projects/${id}`),

  deleteProject: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  patchProjectMeta: (id: string, patch: ProjectMetaPatch) =>
    req<ProjectMeta>(`/projects/${id}/meta`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  getConfig: () => req<CostingConfig>("/config/costing"),

  putConfig: (cfg: CostingConfig) =>
    req<CostingConfig>("/config/costing", {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),

  getAIConfig: () => req<AIConfigStatus>("/config/ai"),

  setAIKey: (key: string | null) =>
    req<AIConfigStatus>("/config/ai", {
      method: "PUT",
      body: JSON.stringify({ anthropic_api_key: key }),
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
      if (res.status === 422) {
        try {
          const parsed = JSON.parse(body) as { detail?: unknown };
          const d = parsed.detail;
          if (d && typeof d === "object" && (d as { code?: string }).code === "crv3d_not_supported") {
            const det = d as {
              message: string;
              metadata: Crv3dMetadata;
              preview_gif_base64: string | null;
            };
            throw new Crv3dNotSupportedError(det.message, det.metadata, det.preview_gif_base64);
          }
        } catch (e) {
          if (e instanceof Crv3dNotSupportedError) throw e;
        }
      }
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return res.json() as Promise<FurnitureImportResponse>;
  },

  listFurniture: () => req<FurnitureItem[]>("/furniture"),

  getFurniture: async (id: string): Promise<FurnitureDetail> => {
    const raw = await req<RawFurnitureDetail>(`/furniture/${id}`);
    const layers: string[] = [];
    const piece_roles: Record<string, string> = {};
    const depthsByLayer: Record<string, number[]> = {};
    for (const p of raw.pieces) {
      if (!layers.includes(p.layer)) layers.push(p.layer);
      if (!(p.layer in piece_roles)) piece_roles[p.layer] = p.role ?? "";
      (depthsByLayer[p.layer] ??= []).push(p.depth);
    }
    const layer_depths: Record<string, number> = {};
    for (const [l, ds] of Object.entries(depthsByLayer)) {
      const sorted = ds.slice().sort((a, b) => a - b);
      const n = sorted.length;
      const m = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      layer_depths[l] = Math.round(m * 100) / 100;
    }
    // Overrides from DB win over computed values
    const depths_override = raw.layer_depths_override ?? {};
    const merged_depths = { ...layer_depths, ...depths_override };
    return {
      furniture_id: raw.furniture_id,
      name: raw.name,
      thumbnail_url: raw.thumbnail_url,
      contours_count: raw.pieces.length,
      layers,
      layer_depths: merged_depths,
      layer_depths_override: depths_override,
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

  updateLayerDepths: (id: string, depths: Record<string, number>) =>
    req<{ ok: boolean }>(`/furniture/${id}/layer_depths`, {
      method: "PUT",
      body: JSON.stringify({ depths }),
    }),

  optimizeImported: (id: string, body: OptimizeImportedRequest = {}) =>
    req<OptimizeImportedResponse>(`/furniture/${id}/optimize`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  suggestRoles: (id: string) =>
    req<{ suggestions: Record<string, string>; layers_analyzed: number; model: string }>(
      `/furniture/${id}/suggest-roles`,
      { method: "POST", body: JSON.stringify({}) },
    ),
};

