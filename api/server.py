"""FastAPI wrapper sobre `run_pipeline`. Corre en :8000.

    uvicorn api.server:app --reload --port 8000
"""
from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from costing import HardwareItem
from main import run_pipeline
from nesting import OffcutInventory
from parametric import Cabinet, ShelvingUnit

from .schemas import (
    CostDTO,
    LayoutDTO,
    OffcutDTO,
    PieceDTO,
    PipelineRequest,
    PipelineResponse,
    PlacedPieceDTO,
    SheetUsageDTO,
)

app = FastAPI(title="m_m_optimizer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_furniture(spec):
    if spec.tipo == "cabinet":
        return Cabinet(
            ancho=spec.ancho, alto=spec.alto, profundidad=spec.profundidad,
            num_estantes=spec.num_estantes, con_fondo=spec.con_fondo,
        )
    return ShelvingUnit(
        ancho=spec.ancho, alto=spec.alto, profundidad=spec.profundidad,
        num_estantes=spec.num_estantes,
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/pipeline/run", response_model=PipelineResponse)
def run(req: PipelineRequest) -> PipelineResponse:
    try:
        furniture = _build_furniture(req.furniture)
        herrajes = [HardwareItem(h.nombre, h.qty, h.precio_unit) for h in req.herrajes]
        dxf_path = "output/nesting.dxf" if req.export_dxf else None

        result = run_pipeline(
            furniture,
            use_inventory=req.use_inventory,
            horas_mo=req.horas_mo,
            herrajes=herrajes,
            dxf_path=dxf_path,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _serialize(result)


@app.get("/inventory/offcuts")
def list_offcuts():
    inv = OffcutInventory()
    out = []
    for o in inv.available():
        out.append(asdict(o) if is_dataclass(o) else o)
    return out


def _sheet_efficiency(u) -> float:
    total = u.sheet.width * u.sheet.height
    if total <= 0:
        return 0.0
    used = sum(p.width * p.height for p in u.placements)
    return used / total


def _serialize(result) -> PipelineResponse:
    pieces = [
        PieceDTO(
            name=p.name, width=p.width, height=p.height, qty=p.qty,
            grain_locked=p.grain_locked, edged=p.edged,
        )
        for p in result.pieces
    ]

    sheets: List[SheetUsageDTO] = []
    for u in result.layout.sheets_used:
        placed = [
            PlacedPieceDTO(
                piece_name=pp.piece_name, x=pp.x, y=pp.y,
                width=pp.width, height=pp.height, rotated=pp.rotated,
            )
            for pp in u.placements
        ]
        sheets.append(SheetUsageDTO(
            sheet_id=u.sheet.id, sheet_width=u.sheet.width, sheet_height=u.sheet.height,
            is_offcut=u.sheet.is_offcut, placed=placed,
            efficiency=_sheet_efficiency(u),
        ))

    layout = LayoutDTO(
        sheets_used=sheets,
        unplaced=[
            PieceDTO(name=p.name, width=p.width, height=p.height, qty=p.qty,
                     grain_locked=p.grain_locked, edged=p.edged)
            for p in result.layout.unplaced
        ],
        new_offcuts=[
            OffcutDTO(id=o.id, width=o.width, height=o.height)
            for o in result.layout.new_offcuts
        ],
        efficiency=result.layout.efficiency,
    )

    c = result.costo
    costo = CostDTO(
        material_placas=c.material_placas,
        material_retazos=c.material_retazos,
        tapacanto=c.tapacanto,
        tiempo_cnc=c.tiempo_cnc,
        mano_obra=c.mano_obra,
        herrajes=c.herrajes,
        margen=c.margen,
        subtotal=c.subtotal,
        total=c.total,
        placas_nuevas=c.placas_nuevas,
        retazos_consumidos=c.retazos_consumidos,
        metros_tapacanto=c.metros_tapacanto,
        minutos_cnc=c.minutos_cnc,
        horas_mo=c.horas_mo,
    )

    return PipelineResponse(
        pieces=pieces, layout=layout, costo=costo,
        dxf_path=result.dxf_path, warnings=result.warnings,
    )
