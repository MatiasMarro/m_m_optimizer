# Copyright (c) 2024-2026 Matías Marro. All rights reserved.
# m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
"""FastAPI wrapper sobre `run_pipeline`. Corre en :8000.

    uvicorn api.server:app --reload --port 8000

En modo .exe, también sirve el build estático de React desde ui/dist/.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from costing import HardwareItem
from costing.calculator import CostCalculator
from main import run_pipeline
from nesting import OffcutInventory
from nesting.models import Layout, PlacedPiece, Sheet, SheetUsage
from nesting.models import Piece as NestingPiece
from parametric import Cabinet, ShelvingUnit

from .schemas import (
    AIConfigStatus,
    AIConfigUpdate,
    CostDTO,
    CostingConfig,
    EstimateRequest,
    EstimateResponse,
    LayoutDTO,
    OffcutDTO,
    PieceDTO,
    PipelineRequest,
    PipelineResponse,
    PlacedPieceDTO,
    ProjectMeta,
    ProjectMetaPatch,
    RecomputeCostsRequest,
    SaveProjectRequest,
    SavedProject,
    SheetUsageDTO,
)

PROJECTS_DIR = Path(__file__).parent.parent / "data" / "projects"
CONFIG_PATH = Path(__file__).parent.parent / "data" / "config.json"

# Cuando se ejecuta como .exe empaquetado con PyInstaller, los archivos
# estáticos viven en sys._MEIPASS. En desarrollo usan la ruta normal.
def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).parent.parent

_UI_DIST = _base_dir() / "ui" / "dist"

# Si el launcher sobreescribió MM_DATA_DIR (modo exe), usarlo para data mutable.
_data_root = Path(os.environ["MM_DATA_DIR"]) if "MM_DATA_DIR" in os.environ else Path(__file__).parent.parent / "data"
PROJECTS_DIR = _data_root / "projects"
CONFIG_PATH = _data_root / "config.json"

_COSTING_DEFAULTS: dict = {
    "precio_placa_mdf18": 45000.0,
    "factor_valor_retazo": 0.5,
    "precio_tapacanto_m": 800.0,
    "costo_hora_cnc": 8000.0,
    "velocidad_corte_mm_min": 3000.0,
    "costo_hora_mo": 3500.0,
    "horas_mo_default": 4.0,
    "margen": 0.40,
    "kerf_mm": 3.0,
}


def _read_costing_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return dict(_COSTING_DEFAULTS)

app = FastAPI(title="m_m_optimizer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.app.routers.furniture_import import router as furniture_router
app.include_router(furniture_router)

from backend.app.db import init_db
init_db()


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
    return {
        "ok": True,
        "product": "m_m_optimizer-cnc",
        "author": "Matías Marro",
        "copyright": "© 2024-2026 Matías Marro. All rights reserved.",
    }


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


@app.post("/pipeline/recompute_costs", response_model=CostDTO)
def recompute_costs(req: RecomputeCostsRequest) -> CostDTO:
    """Recalcula el costo sobre un layout existente con las tarifas vigentes.

    No reoptimiza nesting — útil cuando el usuario cambió tarifas en Ajustes
    y quiere ver el impacto sin tener que rehacer el pipeline completo.
    """
    cfg_data = _read_costing_config()
    if req.overrides is not None:
        for k, v in req.overrides.model_dump(exclude_none=True).items():
            cfg_data[k] = v

    pieces = [
        NestingPiece(
            name=p.name,
            width=p.width,
            height=p.height,
            qty=p.qty,
            grain_locked=p.grain_locked,
            edged=p.edged,
        )
        for p in req.pieces
    ]

    sheets_used: List[SheetUsage] = []
    for s in req.layout.sheets_used:
        sheet = Sheet(
            id=s.sheet_id,
            width=s.sheet_width,
            height=s.sheet_height,
            is_offcut=s.is_offcut,
        )
        placements = [
            PlacedPiece(
                piece_name=pp.piece_name,
                sheet_id=s.sheet_id,
                x=pp.x,
                y=pp.y,
                width=pp.width,
                height=pp.height,
                rotated=pp.rotated,
            )
            for pp in s.placed
        ]
        sheets_used.append(SheetUsage(sheet=sheet, placements=placements))

    layout = Layout(
        sheets_used=sheets_used,
        unplaced=[],
        efficiency=req.layout.efficiency,
        new_offcuts=[],
    )

    calc = CostCalculator(
        precio_placa=cfg_data["precio_placa_mdf18"],
        factor_retazo=cfg_data["factor_valor_retazo"],
        precio_tapacanto_m=cfg_data["precio_tapacanto_m"],
        costo_hora_cnc=cfg_data["costo_hora_cnc"],
        velocidad_corte=cfg_data["velocidad_corte_mm_min"],
        costo_hora_mo=cfg_data["costo_hora_mo"],
        margen=cfg_data["margen"],
        kerf=cfg_data["kerf_mm"],
    )
    horas_mo = req.horas_mo if req.horas_mo is not None else cfg_data["horas_mo_default"]
    herrajes = [HardwareItem(h.nombre, h.qty, h.precio_unit) for h in req.herrajes]

    b = calc.compute(layout, pieces, horas_mo=horas_mo, herrajes=herrajes)
    return CostDTO(
        material_placas=b.material_placas,
        material_retazos=b.material_retazos,
        tapacanto=b.tapacanto,
        tiempo_cnc=b.tiempo_cnc,
        mano_obra=b.mano_obra,
        herrajes=b.herrajes,
        margen=b.margen,
        subtotal=b.subtotal,
        total=b.total,
        placas_nuevas=b.placas_nuevas,
        retazos_consumidos=b.retazos_consumidos,
        metros_tapacanto=b.metros_tapacanto,
        minutos_cnc=b.minutos_cnc,
        horas_mo=b.horas_mo,
    )


@app.get("/inventory/offcuts")
def list_offcuts():
    inv = OffcutInventory()
    out = []
    for o in inv.available():
        out.append(asdict(o) if is_dataclass(o) else o)
    return out


from nesting.models import Sheet as NestingSheet

@app.post("/inventory/offcuts", status_code=201)
def add_offcut(body: dict):
    """Agrega un retazo manual. Body: {ancho: float, alto: float}"""
    ancho = float(body.get("ancho", 0))
    alto = float(body.get("alto", 0))
    if ancho < 1 or alto < 1:
        raise HTTPException(status_code=400, detail="ancho y alto deben ser > 0")
    inv = OffcutInventory()
    new_id = inv.next_id()
    sheet = NestingSheet(id=new_id, width=ancho, height=alto, is_offcut=True)
    inv.add(sheet)
    inv.save()
    return {"id": new_id, "ancho": ancho, "alto": alto, "usado": False}


@app.post("/projects", response_model=ProjectMeta)
def save_project(req: SaveProjectRequest) -> ProjectMeta:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    pid = str(uuid.uuid4())[:8]
    meta = ProjectMeta(
        id=pid,
        nombre=req.nombre,
        created_at=datetime.now(timezone.utc).isoformat(),
        furniture_tipo=req.spec.tipo,
        ancho=req.spec.ancho,
        alto=req.spec.alto,
        profundidad=req.spec.profundidad,
    )
    saved = SavedProject(meta=meta, spec=req.spec, result=req.result)
    (PROJECTS_DIR / f"{pid}.json").write_text(
        saved.model_dump_json(indent=2), encoding="utf-8"
    )
    return meta


@app.patch("/projects/{project_id}/meta", response_model=ProjectMeta)
def patch_project_meta(project_id: str, patch: ProjectMetaPatch) -> ProjectMeta:
    """Actualiza solo metadata (nombre/tags/favorito/notas/fotos) sin tocar spec ni result."""
    path = PROJECTS_DIR / f"{project_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("meta", {})
    for k, v in patch.model_dump(exclude_none=True).items():
        meta[k] = v
    data["meta"] = meta
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return ProjectMeta(**meta)


@app.post("/pipeline/estimate", response_model=EstimateResponse)
def estimate_pipeline(req: EstimateRequest) -> EstimateResponse:
    """Estima placas y desperdicio sin correr nesting completo (solo suma áreas)."""
    from nesting.config import STANDARD_SHEET_W, STANDARD_SHEET_H
    try:
        furniture = _build_furniture(req.furniture)
        pieces = list(furniture.get_pieces())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    sheet_area = float(STANDARD_SHEET_W) * float(STANDARD_SHEET_H)
    total_area = sum(p.width * p.height * p.qty for p in pieces)
    pieces_count = sum(p.qty for p in pieces)
    sheets_est = max(1, int(-(-total_area // sheet_area))) if total_area > 0 else 0
    capacity = sheet_area * sheets_est if sheets_est > 0 else sheet_area
    waste_pct = max(0.0, (capacity - total_area) / capacity * 100.0) if capacity > 0 else 0.0
    return EstimateResponse(
        pieces_count=pieces_count,
        total_area_mm2=total_area,
        sheet_area_mm2=sheet_area,
        sheets_estimated=sheets_est,
        waste_pct=round(waste_pct, 2),
    )


@app.get("/projects", response_model=List[ProjectMeta])
def list_projects() -> List[ProjectMeta]:
    if not PROJECTS_DIR.exists():
        return []
    metas: List[ProjectMeta] = []
    for f in PROJECTS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            metas.append(ProjectMeta(**data["meta"]))
        except (json.JSONDecodeError, KeyError, ValueError):
            continue
    metas.sort(key=lambda m: m.created_at, reverse=True)
    return metas


@app.get("/projects/{project_id}", response_model=SavedProject)
def get_project(project_id: str) -> SavedProject:
    path = PROJECTS_DIR / f"{project_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    return SavedProject(**data)


@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    path = PROJECTS_DIR / f"{project_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    path.unlink()
    return {"ok": True}


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


_OUTPUT_DIR = Path(__file__).parent.parent / "output"

@app.get("/output/nesting.dxf", include_in_schema=False)
def download_dxf():
    """Descarga el último DXF generado."""
    dxf_path = _OUTPUT_DIR / "nesting.dxf"
    if not dxf_path.exists():
        raise HTTPException(status_code=404, detail="DXF no generado aún. Exportá primero desde el Diseñador.")
    return FileResponse(
        str(dxf_path),
        media_type="application/dxf",
        filename="nesting.dxf",
    )


@app.get("/config/costing", response_model=CostingConfig)
def get_costing_config():
    return _read_costing_config()


@app.put("/config/costing", response_model=CostingConfig)
def put_costing_config(cfg: CostingConfig):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Preserve sensitive fields (anthropic_api_key) when overwriting
    existing: dict = {}
    if CONFIG_PATH.exists():
        try:
            existing = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = {}
    merged = {**cfg.model_dump(), "anthropic_api_key": existing.get("anthropic_api_key")}
    if not merged["anthropic_api_key"]:
        merged.pop("anthropic_api_key", None)
    CONFIG_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    return cfg


def _read_full_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def _mask_key(key: Optional[str]) -> Optional[str]:
    if not key or len(key) < 8:
        return None
    return f"{key[:7]}…{key[-4:]}"


@app.get("/config/ai", response_model=AIConfigStatus)
def get_ai_config():
    """Estado de la config de IA. Nunca devuelve la key en plano."""
    cfg = _read_full_config()
    key = cfg.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY")
    return AIConfigStatus(
        has_anthropic_api_key=bool(key),
        masked_key=_mask_key(key),
    )


@app.put("/config/ai", response_model=AIConfigStatus)
def put_ai_config(body: AIConfigUpdate):
    """Setea o limpia la API key. `null`/`""` la borra del config (env queda intacto)."""
    cfg = _read_full_config()
    new_key = (body.anthropic_api_key or "").strip() or None
    if new_key:
        cfg["anthropic_api_key"] = new_key
    else:
        cfg.pop("anthropic_api_key", None)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    effective = new_key or os.environ.get("ANTHROPIC_API_KEY")
    return AIConfigStatus(
        has_anthropic_api_key=bool(effective),
        masked_key=_mask_key(effective),
    )


# ---------------------------------------------------------------------------
# Static files + SPA catch-all (activo solo cuando ui/dist existe)
# En desarrollo, Vite corre en :5173 y este bloque no interfiere.
# En el .exe, sirve el build de React directamente desde FastAPI.
# ---------------------------------------------------------------------------
if _UI_DIST.exists():
    # Archivos estáticos de Vite (assets JS/CSS)
    app.mount("/assets", StaticFiles(directory=str(_UI_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """Devuelve index.html para cualquier ruta no-API (SPA routing)."""
        index = _UI_DIST / "index.html"
        return FileResponse(str(index))
