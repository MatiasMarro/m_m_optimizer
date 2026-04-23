// Espejo de api/schemas.py. Mantener en sync manualmente (por ahora).

export type FurnitureType = "cabinet" | "shelving";

export interface FurnitureSpec {
  tipo: FurnitureType;
  ancho: number;
  alto: number;
  profundidad: number;
  espesor?: number;
  num_estantes?: number;
  con_fondo?: boolean;
}

export interface HardwareItem {
  nombre: string;
  qty: number;
  precio_unit: number;
}

export interface PipelineRequest {
  furniture: FurnitureSpec;
  use_inventory?: boolean;
  horas_mo?: number;
  herrajes?: HardwareItem[];
  export_dxf?: boolean;
}

export interface Piece {
  name: string;
  width: number;
  height: number;
  qty: number;
  grain_locked: boolean;
  edged: [boolean, boolean, boolean, boolean];
}

export interface PlacedPiece {
  piece_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

export interface SheetUsage {
  sheet_id: string;
  sheet_width: number;
  sheet_height: number;
  is_offcut: boolean;
  placed: PlacedPiece[];
  efficiency: number;
}

export interface Offcut {
  id: string;
  width: number;
  height: number;
}

export interface Layout {
  sheets_used: SheetUsage[];
  unplaced: Piece[];
  new_offcuts: Offcut[];
  efficiency: number;
}

export interface Cost {
  material_placas: number;
  material_retazos: number;
  tapacanto: number;
  tiempo_cnc: number;
  mano_obra: number;
  herrajes: number;
  margen: number;
  subtotal: number;
  total: number;
  placas_nuevas: number;
  retazos_consumidos: number;
  metros_tapacanto: number;
  minutos_cnc: number;
  horas_mo: number;
}

export interface PipelineResponse {
  pieces: Piece[];
  layout: Layout;
  costo: Cost;
  dxf_path: string | null;
  warnings: string[];
}
