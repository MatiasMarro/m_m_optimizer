# Copyright (c) 2024-2026 Matías Marro. All rights reserved.
# m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
"""Pydantic schemas para la API. Espejan los dataclasses del core."""
from __future__ import annotations

from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


class FurnitureSpec(BaseModel):
    tipo: Literal["cabinet", "shelving"]
    ancho: float
    alto: float
    profundidad: float
    espesor: float = 18
    num_estantes: int = 1
    con_fondo: bool = True


class HardwareItemDTO(BaseModel):
    nombre: str
    qty: int
    precio_unit: float


class PipelineRequest(BaseModel):
    furniture: FurnitureSpec
    use_inventory: bool = False
    horas_mo: Optional[float] = None
    herrajes: List[HardwareItemDTO] = Field(default_factory=list)
    export_dxf: bool = False


class PieceDTO(BaseModel):
    name: str
    width: float
    height: float
    qty: int
    grain_locked: bool
    edged: Tuple[bool, bool, bool, bool]


class PlacedPieceDTO(BaseModel):
    piece_name: str
    x: float
    y: float
    width: float
    height: float
    rotated: bool


class SheetUsageDTO(BaseModel):
    sheet_id: str
    sheet_width: float
    sheet_height: float
    is_offcut: bool
    placed: List[PlacedPieceDTO]
    efficiency: float


class OffcutDTO(BaseModel):
    id: str
    width: float
    height: float


class LayoutDTO(BaseModel):
    sheets_used: List[SheetUsageDTO]
    unplaced: List[PieceDTO]
    new_offcuts: List[OffcutDTO]
    efficiency: float


class CostDTO(BaseModel):
    material_placas: float
    material_retazos: float
    tapacanto: float
    tiempo_cnc: float
    mano_obra: float
    herrajes: float
    margen: float
    subtotal: float
    total: float
    placas_nuevas: int
    retazos_consumidos: int
    metros_tapacanto: float
    minutos_cnc: float
    horas_mo: float


class PipelineResponse(BaseModel):
    pieces: List[PieceDTO]
    layout: LayoutDTO
    costo: CostDTO
    dxf_path: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class ProjectMeta(BaseModel):
    id: str
    nombre: str
    created_at: str
    furniture_tipo: Literal["cabinet", "shelving"]
    ancho: float
    alto: float
    profundidad: float
    tags: List[str] = Field(default_factory=list)
    favorito: bool = False
    notas: str = ""
    foto_urls: List[str] = Field(default_factory=list)


class ProjectMetaPatch(BaseModel):
    """Body para `PATCH /projects/{id}/meta`. Todos los campos son opcionales."""
    nombre: Optional[str] = None
    tags: Optional[List[str]] = None
    favorito: Optional[bool] = None
    notas: Optional[str] = None
    foto_urls: Optional[List[str]] = None


class SavedProject(BaseModel):
    meta: ProjectMeta
    spec: FurnitureSpec
    result: PipelineResponse


class SaveProjectRequest(BaseModel):
    nombre: str
    spec: FurnitureSpec
    result: PipelineResponse


class CostingOverrides(BaseModel):
    """Overrides parciales sobre la config vigente para análisis what-if."""
    precio_placa_mdf18: Optional[float] = None
    factor_valor_retazo: Optional[float] = None
    precio_tapacanto_m: Optional[float] = None
    costo_hora_cnc: Optional[float] = None
    velocidad_corte_mm_min: Optional[float] = None
    costo_hora_mo: Optional[float] = None
    margen: Optional[float] = None
    kerf_mm: Optional[float] = None


class RecomputeCostsRequest(BaseModel):
    """Recalcula solo costos con las tarifas vigentes, sin reoptimizar nesting."""
    pieces: List[PieceDTO]
    layout: LayoutDTO
    horas_mo: Optional[float] = None
    herrajes: List[HardwareItemDTO] = Field(default_factory=list)
    overrides: Optional[CostingOverrides] = None


class EstimateRequest(BaseModel):
    """Estima placas y desperdicio sin correr el optimizador completo."""
    furniture: FurnitureSpec


class EstimateResponse(BaseModel):
    pieces_count: int
    total_area_mm2: float
    sheet_area_mm2: float
    sheets_estimated: int
    waste_pct: float


class CostingConfig(BaseModel):
    precio_placa_mdf18: float
    factor_valor_retazo: float
    precio_tapacanto_m: float
    costo_hora_cnc: float
    velocidad_corte_mm_min: float
    costo_hora_mo: float
    horas_mo_default: float
    margen: float
    kerf_mm: float


class AIConfigStatus(BaseModel):
    """Estado de la config de IA (NUNCA devuelve la key en plano)."""
    has_anthropic_api_key: bool
    masked_key: Optional[str] = None  # ej. "sk-ant-...XYZ" — sólo últimos 4 chars
    model: str = "claude-opus-4-7"


class AIConfigUpdate(BaseModel):
    """Body para `PUT /config/ai`. `null` o "" limpia la key."""
    anthropic_api_key: Optional[str] = None
