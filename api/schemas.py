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


class SavedProject(BaseModel):
    meta: ProjectMeta
    spec: FurnitureSpec
    result: PipelineResponse


class SaveProjectRequest(BaseModel):
    nombre: str
    spec: FurnitureSpec
    result: PipelineResponse
