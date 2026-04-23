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
export type ProjectMeta       = S["ProjectMeta"];
export type SavedProject      = S["SavedProject"];
export type CostingConfig     = S["CostingConfig"];

