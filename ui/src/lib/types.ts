/**
 * Tipos sincronizados automáticamente con api/schemas.py.
 * Para regenerar: npm run gen:types (requiere backend corriendo en :8000)
 * NO editar manualmente — editar api/schemas.py y regenerar.
 */
import type { components } from "./openapi.generated";

type S = components["schemas"];

export type FurnitureType = "cabinet" | "shelving";

export type FurnitureSpec     = S["FurnitureSpec"];
export type HardwareItem      = S["HardwareItemDTO"];
export type PipelineRequest   = S["PipelineRequest"];
export type Piece             = S["PieceDTO"];
export type PlacedPiece       = S["PlacedPieceDTO"];
export type SheetUsage        = S["SheetUsageDTO"];
export type Offcut            = S["OffcutDTO"];
export type Layout            = S["LayoutDTO"];
export type Cost              = S["CostDTO"];
export type PipelineResponse  = S["PipelineResponse"];
export type ProjectMeta       = S["ProjectMeta"] & {
  tags?: string[];
  favorito?: boolean;
  notas?: string;
  foto_urls?: string[];
};
export type SavedProject      = Omit<S["SavedProject"], "meta"> & { meta: ProjectMeta };
export type CostingConfig     = S["CostingConfig"];

export interface CostingOverrides {
  precio_placa_mdf18?: number;
  factor_valor_retazo?: number;
  precio_tapacanto_m?: number;
  costo_hora_cnc?: number;
  velocidad_corte_mm_min?: number;
  costo_hora_mo?: number;
  margen?: number;
  kerf_mm?: number;
}

export interface EstimateResponse {
  pieces_count: number;
  total_area_mm2: number;
  sheet_area_mm2: number;
  sheets_estimated: number;
  waste_pct: number;
}

export interface ProjectMetaPatch {
  nombre?: string;
  tags?: string[];
  favorito?: boolean;
  notas?: string;
  foto_urls?: string[];
}

