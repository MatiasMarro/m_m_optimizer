"""Router FastAPI para import de DXF + imágenes de referencia de muebles."""
from __future__ import annotations

import base64
import json
import re
import shutil
import uuid
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import List, Optional

import matplotlib

matplotlib.use("Agg")

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.app.db import init_db
from backend.app.dxf.crv_parser import (
    Crv3dExportRequiredError,
    extract_preview_gif,
    is_crv3d_file,
    parse_aspire_crv3d_metadata,
)
from backend.app.dxf.parser import parse_aspire_dxf
from backend.app.repositories import furniture_repo
from backend.app.ai import (
    ClaudeAPIKeyMissingError,
    LayerInfo,
    suggest_roles as ai_suggest_roles,
)

DATA_DIR: Path = Path(__file__).resolve().parents[3] / "data"
FURNITURE_DIR: Path = DATA_DIR / "furniture"

init_db()

ALLOWED_IMAGE_EXTS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp"})
MAX_IMAGES: int = 5
MAX_IMAGE_BYTES: int = 10 * 1024 * 1024
MIN_THICKNESS_MM: float = 10.0
MAX_THICKNESS_MM: float = 50.0

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def setup_furniture_directory(furniture_id: str) -> Path:
    """Crea data/furniture/{id}/ y retorna el Path absoluto."""
    target = FURNITURE_DIR / furniture_id
    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise RuntimeError(f"Failed to create furniture directory '{target}': {e}") from e
    return target


def save_dxf_file(content: bytes, filename: str, furniture_dir: Path) -> str:
    """Valida extensión .dxf/.crv3d y guarda con su nombre canónico."""
    lower = filename.lower()
    if lower.endswith(".dxf"):
        out_name = "original.dxf"
    elif lower.endswith(".crv3d"):
        out_name = "original.crv3d"
    else:
        raise HTTPException(
            status_code=400,
            detail="Extensión inválida. Se aceptan .dxf o .crv3d (Vectric Aspire)",
        )
    (furniture_dir / out_name).write_bytes(content)
    return out_name


async def save_reference_images(
    images: List[UploadFile], furniture_dir: Path
) -> tuple[int, list[str]]:
    """Guarda hasta 5 imágenes ref_NN.ext validando formato y tamaño; retorna (count, warnings)."""
    warnings: list[str] = []
    saved = 0
    index = 0

    if len(images) > MAX_IMAGES:
        warnings.append(
            f"Se recibieron {len(images)} imágenes; sólo se procesarán las primeras {MAX_IMAGES}"
        )

    for img in images[:MAX_IMAGES]:
        fname = img.filename or ""
        ext = Path(fname).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTS:
            warnings.append(f"Imagen '{fname}' con extensión '{ext}' no soportada")
            index += 1
            continue
        try:
            data = await img.read()
        except Exception as e:
            warnings.append(f"No se pudo leer imagen '{fname}': {e}")
            index += 1
            continue
        if len(data) > MAX_IMAGE_BYTES:
            warnings.append(
                f"Imagen '{fname}' excede {MAX_IMAGE_BYTES // (1024 * 1024)}MB y fue descartada"
            )
            index += 1
            continue
        if not data:
            warnings.append(f"Imagen '{fname}' vacía y fue descartada")
            index += 1
            continue
        try:
            out = furniture_dir / f"ref_{index:02d}{ext}"
            out.write_bytes(data)
            saved += 1
        except OSError as e:
            warnings.append(f"No se pudo guardar imagen '{fname}': {e}")
        index += 1

    return saved, warnings


def generate_dxf_thumbnail(dxf_path: Path, out_path: Path) -> bool:
    """Renderiza el DXF a JPEG 200×200 en out_path; retorna True si tuvo éxito."""
    try:
        import matplotlib.pyplot as plt
        import ezdxf
        from ezdxf.addons.drawing import RenderContext, Frontend
        from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

        doc = ezdxf.readfile(str(dxf_path))
        msp = doc.modelspace()
        fig, ax = plt.subplots(figsize=(200 / 72, 200 / 72), dpi=72)
        ctx = RenderContext(doc)
        backend = MatplotlibBackend(ax)
        Frontend(ctx, backend).draw_layout(msp, finalize=True)
        ax.set_aspect("equal")
        ax.axis("off")
        fig.savefig(
            str(out_path),
            bbox_inches="tight",
            pad_inches=0.05,
            facecolor="white",
            dpi=72,
            format="jpeg",
        )
        plt.close(fig)
        return True
    except Exception as e:
        print(f"Thumbnail failed: {e}")
        return False


def _serialize_parsed(parsed_result) -> dict:
    """Convierte ParseResult a dict serializable en JSON."""
    contours = []
    for c in parsed_result.contours:
        d = asdict(c) if is_dataclass(c) else dict(c)
        if "op_type" in d and hasattr(d["op_type"], "value"):
            d["op_type"] = d["op_type"].value
        contours.append(d)
    text_annotations = [
        asdict(t) if is_dataclass(t) else dict(t)
        for t in getattr(parsed_result, "text_annotations", [])
    ]
    return {
        "contours": contours,
        "layer_summary": dict(parsed_result.layer_summary),
        "unrecognized_entities": list(parsed_result.unrecognized_entities),
        "warnings": list(parsed_result.warnings),
        "text_annotations": text_annotations,
    }


def _contour_to_preview(c) -> dict:
    op_type = c.op_type.value if hasattr(c.op_type, "value") else str(c.op_type)
    return {
        "layer": c.layer,
        "op_type": op_type,
        "bbox": list(c.bbox),
        "width": c.width,
        "height": c.height,
        "depth": c.depth,
        "tool_diameter": c.tool_diameter,
    }


def _compute_layer_depths(contours: list) -> dict[str, float]:
    """Mediana de profundidad por layer (mm). Robusto a outliers y contornos vacíos."""
    by_layer: dict[str, list[float]] = {}
    for c in contours or []:
        if isinstance(c, dict):
            layer = c.get("layer")
            depth = c.get("depth")
        else:
            layer = getattr(c, "layer", None)
            depth = getattr(c, "depth", None)
        if not layer or depth is None:
            continue
        try:
            by_layer.setdefault(layer, []).append(float(depth))
        except (TypeError, ValueError):
            continue
    out: dict[str, float] = {}
    for layer, depths in by_layer.items():
        depths_sorted = sorted(depths)
        n = len(depths_sorted)
        median = (
            depths_sorted[n // 2]
            if n % 2
            else (depths_sorted[n // 2 - 1] + depths_sorted[n // 2]) / 2
        )
        out[layer] = round(median, 2)
    return out


router = APIRouter(prefix="/api/furniture", tags=["furniture-import"])


@router.post("/import")
async def import_furniture(
    name: str = Form(...),
    material_thickness: float = Form(18.0),
    dxf_file: UploadFile = File(...),
    reference_images: List[UploadFile] = File(default=[]),
) -> dict:
    """Importa un DXF de Aspire + imágenes de referencia y devuelve el parse preview."""
    if not (MIN_THICKNESS_MM <= material_thickness <= MAX_THICKNESS_MM):
        raise HTTPException(
            status_code=422,
            detail=(
                f"material_thickness debe estar entre {MIN_THICKNESS_MM} y {MAX_THICKNESS_MM} mm"
            ),
        )

    furn_id = str(uuid.uuid4())
    furniture_dir = setup_furniture_directory(furn_id)

    try:
        dxf_bytes = await dxf_file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer DXF: {e}")

    if not dxf_bytes:
        raise HTTPException(status_code=400, detail="Archivo DXF vacío")

    dxf_name = save_dxf_file(dxf_bytes, dxf_file.filename or "", furniture_dir)
    dxf_path = furniture_dir / dxf_name

    if dxf_name.endswith(".crv3d") or is_crv3d_file(str(dxf_path)):
        try:
            meta = parse_aspire_crv3d_metadata(str(dxf_path))
            gif_bytes = extract_preview_gif(str(dxf_path))
        except Exception as e:
            shutil.rmtree(furniture_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail=f"No se pudo leer .crv3d: {e}")
        shutil.rmtree(furniture_dir, ignore_errors=True)
        preview_b64 = base64.b64encode(gif_bytes).decode("ascii") if gif_bytes else None
        raise HTTPException(
            status_code=422,
            detail={
                "code": "crv3d_not_supported",
                "message": (
                    "Archivo .crv3d detectado. El formato nativo de Vectric Aspire "
                    "no es parseable directamente. Exportá como DXF desde Aspire: "
                    "File → Export → Vectors as DXF, y volvé a importar."
                ),
                "metadata": {
                    "aspire_version": meta.aspire_version,
                    "material_width_mm": meta.material_width_mm,
                    "material_height_mm": meta.material_height_mm,
                    "material_thickness_mm": meta.material_thickness_mm,
                    "layer_names": meta.layer_names,
                },
                "preview_gif_base64": preview_b64,
            },
        )

    images_count, warnings = await save_reference_images(reference_images, furniture_dir)

    thumb_path = furniture_dir / "thumb.jpg"
    if not generate_dxf_thumbnail(dxf_path, thumb_path):
        warnings.append("No thumbnail generado")

    try:
        parsed = parse_aspire_dxf(str(dxf_path), material_thickness)
    except Crv3dExportRequiredError as e:
        shutil.rmtree(furniture_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo parsear DXF: {e}")

    parsed_payload = _serialize_parsed(parsed)
    thumbnail_rel = str(thumb_path.relative_to(furniture_dir)) if thumb_path.exists() else None

    try:
        row = furniture_repo.create_imported_furniture(
            id=furn_id,
            name=name,
            dxf_path=str(dxf_path),
            thickness=material_thickness,
            thumbnail_path=thumbnail_rel,
            parsed_data=parsed_payload,
        )
        furniture_repo.upsert_pieces(furn_id, parsed.contours)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error persistiendo en DB: {e}")

    warnings.extend(parsed.warnings)

    pieces_preview = [_contour_to_preview(c) for c in parsed.contours]

    return {
        "furniture_id": furn_id,
        "name": name,
        "thumbnail_url": f"/api/furniture/{furn_id}/thumbnail",
        "dxf_filename": dxf_name,
        "contours_count": len(parsed.contours),
        "layers": list(parsed.layer_summary.keys()),
        "pieces_preview": pieces_preview,
        "uploaded_images_count": images_count,
        "warnings": warnings,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/{furniture_id}/thumbnail")
async def get_thumbnail(furniture_id: str):
    """Sirve el thumbnail JPEG del mueble importado."""
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inválido")
    thumb_path = FURNITURE_DIR / furniture_id / "thumb.jpg"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail no encontrado")
    return FileResponse(str(thumb_path), media_type="image/jpeg")


@router.get("")
async def list_furniture() -> list[dict]:
    """Lista todos los muebles importados (orden desc por created_at)."""
    rows = furniture_repo.list_imported_furniture()
    out: list[dict] = []
    for r in rows:
        try:
            parsed = json.loads(r.parsed_data) if r.parsed_data else {}
        except (TypeError, json.JSONDecodeError):
            parsed = {}
        layers = list((parsed.get("layer_summary") or {}).keys())
        contours = parsed.get("contours") or []
        contours_count = len(contours)
        try:
            piece_roles = json.loads(r.piece_roles) if r.piece_roles else {}
        except (TypeError, json.JSONDecodeError):
            piece_roles = {}
        layer_depths = _compute_layer_depths(contours)
        try:
            depths_override = json.loads(r.layer_depths_override) if r.layer_depths_override else {}
        except (TypeError, json.JSONDecodeError):
            depths_override = {}
        merged_depths = {**layer_depths, **depths_override}
        out.append({
            "furniture_id": r.id,
            "name": r.name,
            "thumbnail_url": f"/api/furniture/{r.id}/thumbnail",
            "contours_count": contours_count,
            "layers": layers,
            "layer_depths": merged_depths,
            "layer_depths_override": depths_override,
            "piece_roles": piece_roles,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return out


@router.get("/{furniture_id}")
async def get_furniture(furniture_id: str) -> dict:
    """Detalle de un mueble importado con sus piezas."""
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inválido")
    row = furniture_repo.get_imported_furniture(furniture_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Furniture no encontrado")

    pieces_rows = furniture_repo.list_pieces_for(furniture_id)
    pieces: list[dict] = []
    for p in pieces_rows:
        try:
            vertices = json.loads(p.vertices) if p.vertices else []
        except (TypeError, json.JSONDecodeError):
            vertices = []
        pieces.append({
            "id": p.id,
            "layer": p.layer,
            "role": p.role,
            "vertices": vertices,
            "width": p.width,
            "height": p.height,
            "depth": p.depth,
            "quantity": p.quantity,
        })

    try:
        depths_override = json.loads(row.layer_depths_override) if row.layer_depths_override else {}
    except (TypeError, json.JSONDecodeError):
        depths_override = {}

    return {
        "furniture_id": row.id,
        "name": row.name,
        "thumbnail_url": f"/api/furniture/{row.id}/thumbnail",
        "material_thickness": row.material_thickness,
        "version": row.version,
        "layer_depths_override": depths_override,
        "pieces": pieces,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.put("/{furniture_id}/layer_depths")
async def put_layer_depths(
    furniture_id: str,
    body: dict = Body(...),
) -> dict:
    """Persiste overrides de profundidad por layer (mm). Body: {depths: {layer: mm}}"""
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inv\u00e1lido")
    depths = body.get("depths") if isinstance(body, dict) else None
    if not isinstance(depths, dict):
        raise HTTPException(status_code=422, detail="body.depths debe ser {layer: mm}")
    # Validar que todos los valores sean numéricos
    try:
        depths_float = {k: float(v) for k, v in depths.items()}
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Valor no num\u00e9rico en depths: {exc}") from exc
    ok = furniture_repo.update_layer_depths(furniture_id, depths_float)
    if not ok:
        raise HTTPException(status_code=404, detail="Furniture no encontrado")
    return {"ok": True}


@router.put("/{furniture_id}/roles")
async def put_furniture_roles(
    furniture_id: str,
    body: dict = Body(...),
) -> dict:
    """Asigna roles (p. ej. 'lateral', 'fondo') a layers de un mueble."""
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inválido")
    roles = body.get("roles") if isinstance(body, dict) else None
    if not isinstance(roles, dict):
        raise HTTPException(status_code=422, detail="body.roles debe ser un objeto {layer: role}")
    ok = furniture_repo.update_piece_roles(furniture_id, roles)
    if not ok:
        raise HTTPException(status_code=404, detail="Furniture no encontrado")
    return {"ok": True}


@router.delete("/{furniture_id}")
async def delete_furniture(furniture_id: str) -> dict:
    """Elimina DB rows y el directorio data/furniture/{id}/."""
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inválido")
    ok = furniture_repo.delete_imported_furniture(furniture_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Furniture no encontrado")
    shutil.rmtree(FURNITURE_DIR / furniture_id, ignore_errors=True)
    return {"ok": True}


# ─── Conversión importado → pipeline ──────────────────────────────────────────

# Tolerancia para agrupar piezas con dimensiones similares (mm)
_DIM_GROUP_TOL: float = 1.0

# Roles cuyas piezas requieren grano lockeado por defecto (no rotables)
_GRAIN_LOCKED_ROLES: frozenset[str] = frozenset({"lateral"})


def _build_pieces_from_imported(
    parsed: dict, piece_roles: dict
) -> tuple[list, list[str]]:
    """Convierte contornos PROFILE de un mueble importado en `nesting.Piece[]`.

    Agrupa contornos por (role|layer, width≈, height≈) y suma cantidades.
    Retorna (pieces, warnings).
    """
    from nesting.models import Piece as NestingPiece

    contours = parsed.get("contours") or []
    warnings: list[str] = []

    # bucket: key=(name, round(w/tol), round(h/tol)) → {name, w, h, qty, grain_locked}
    buckets: dict[tuple, dict] = {}
    for c in contours:
        if not isinstance(c, dict):
            continue
        if (c.get("op_type") or "").lower() != "profile":
            continue
        layer = c.get("layer") or "?"
        role = (piece_roles.get(layer) or "").strip()
        name = role or layer
        w = float(c.get("width") or 0)
        h = float(c.get("height") or 0)
        if w <= 0 or h <= 0:
            warnings.append(f"Contorno '{layer}' descartado: dimensiones inválidas ({w}×{h})")
            continue
        key = (name, round(w / _DIM_GROUP_TOL), round(h / _DIM_GROUP_TOL))
        if key in buckets:
            buckets[key]["qty"] += 1
        else:
            buckets[key] = {
                "name": name,
                "w": w,
                "h": h,
                "qty": 1,
                "grain_locked": role.lower() in _GRAIN_LOCKED_ROLES,
            }

    pieces = [
        NestingPiece(
            name=b["name"],
            width=b["w"],
            height=b["h"],
            qty=b["qty"],
            grain_locked=b["grain_locked"],
        )
        for b in buckets.values()
    ]
    return pieces, warnings


def _aggregate_layers_for_ai(parsed: dict) -> list[LayerInfo]:
    """Agrupa contornos por layer y produce LayerInfo[] para el analyzer."""
    contours = parsed.get("contours") or []
    by_layer: dict[str, dict] = {}
    for c in contours:
        if not isinstance(c, dict):
            continue
        layer = c.get("layer")
        if not layer:
            continue
        bucket = by_layer.setdefault(layer, {
            "count": 0,
            "op_types": {},
            "widths": [],
            "heights": [],
            "depths": [],
        })
        bucket["count"] += 1
        op = (c.get("op_type") or "unknown").lower()
        bucket["op_types"][op] = bucket["op_types"].get(op, 0) + 1
        for src, dst in (("width", "widths"), ("height", "heights"), ("depth", "depths")):
            v = c.get(src)
            if isinstance(v, (int, float)):
                bucket[dst].append(float(v))

    def _avg(xs: list[float]) -> Optional[float]:
        return round(sum(xs) / len(xs), 2) if xs else None

    return [
        LayerInfo(
            name=name,
            count=b["count"],
            op_type_distribution=b["op_types"],
            avg_width=_avg(b["widths"]),
            avg_height=_avg(b["heights"]),
            avg_depth=_avg(b["depths"]),
        )
        for name, b in by_layer.items()
    ]


@router.post("/{furniture_id}/suggest-roles")
async def ai_suggest_roles_endpoint(furniture_id: str) -> dict:
    """Llama a Claude Opus 4.7 para sugerir roles por layer del mueble.

    Retorna `{suggestions: {layer: role}, layers_analyzed: int, model: str}`.
    Levanta 422 si no hay API key configurada, 502 si la llamada al API falla.
    """
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inválido")

    row = furniture_repo.get_imported_furniture(furniture_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Furniture no encontrado")

    try:
        parsed = json.loads(row.parsed_data) if row.parsed_data else {}
    except (TypeError, json.JSONDecodeError):
        parsed = {}

    layers = _aggregate_layers_for_ai(parsed)
    if not layers:
        raise HTTPException(
            status_code=422,
            detail="El mueble no tiene layers analizables. Re-importá el DXF.",
        )

    config_path = DATA_DIR / "config.json"
    text_annotations = parsed.get("text_annotations") or []
    try:
        suggestions = ai_suggest_roles(
            furniture_name=row.name,
            material_thickness=float(row.material_thickness or 18.0),
            layers=layers,
            text_annotations=text_annotations,
            config_path=config_path,
        )
    except ClaudeAPIKeyMissingError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error llamando a Claude: {type(e).__name__}: {e}",
        )

    return {
        "suggestions": suggestions,
        "layers_analyzed": len(layers),
        "model": "claude-opus-4-7",
    }


@router.post("/{furniture_id}/optimize")
async def optimize_imported(furniture_id: str, body: dict = Body(default={})) -> dict:
    """Convierte un mueble importado en piezas y corre el pipeline de nesting.

    Body opcional:
        use_inventory: bool = False
        horas_mo: float | null
        compare_inventory: bool = False  → si true, corre dos veces (con/sin retazos)
                                            y devuelve {without, with, savings}
    """
    if not _UUID_RE.match(furniture_id):
        raise HTTPException(status_code=400, detail="furniture_id inválido")

    row = furniture_repo.get_imported_furniture(furniture_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Furniture no encontrado")

    try:
        parsed = json.loads(row.parsed_data) if row.parsed_data else {}
    except (TypeError, json.JSONDecodeError):
        parsed = {}
    try:
        piece_roles = json.loads(row.piece_roles) if row.piece_roles else {}
    except (TypeError, json.JSONDecodeError):
        piece_roles = {}

    pieces, build_warnings = _build_pieces_from_imported(parsed, piece_roles)
    if not pieces:
        raise HTTPException(
            status_code=422,
            detail=(
                "Este mueble no tiene contornos PROFILE convertibles a piezas. "
                "Asigná roles a los layers o verificá que el DXF contenga geometría de corte."
            ),
        )

    use_inventory = bool(body.get("use_inventory", False))
    horas_mo = body.get("horas_mo")
    compare = bool(body.get("compare_inventory", False))

    # Import lazy para evitar ciclos al testear sin el pipeline cargado
    from main import run_pipeline_from_pieces  # noqa: PLC0415
    from api.server import _serialize  # noqa: PLC0415

    def _run(use_inv: bool):
        # Cada corrida usa Piece[] frescas (deepcopy via list comprehension de los buckets)
        from nesting.models import Piece as NP
        fresh = [NP(name=p.name, width=p.width, height=p.height, qty=p.qty,
                    grain_locked=p.grain_locked) for p in pieces]
        result = run_pipeline_from_pieces(
            fresh,
            use_inventory=use_inv,
            horas_mo=horas_mo if isinstance(horas_mo, (int, float)) else None,
        )
        resp = _serialize(result)
        # Inyectar warnings del builder y del furniture origen
        resp.warnings = list(resp.warnings) + build_warnings
        return resp

    if compare:
        without = _run(False)
        with_inv = _run(True)
        # NOTA: la corrida _with_ persiste consumos al inventory; la _without_ no.
        # Como _run(True) es la última, los retazos consumidos quedan en disco.
        sheets_without = sum(1 for s in without.layout.sheets_used if not s.is_offcut)
        sheets_with = sum(1 for s in with_inv.layout.sheets_used if not s.is_offcut)
        offcuts_used = sum(1 for s in with_inv.layout.sheets_used if s.is_offcut)
        savings_ars = without.costo.total - with_inv.costo.total
        return {
            "compare": True,
            "without_inventory": without.model_dump(mode="json"),
            "with_inventory": with_inv.model_dump(mode="json"),
            "summary": {
                "sheets_without": sheets_without,
                "sheets_with": sheets_with,
                "offcuts_used": offcuts_used,
                "savings_ars": savings_ars,
                "savings_pct": (savings_ars / without.costo.total) if without.costo.total > 0 else 0.0,
            },
        }

    resp = _run(use_inventory)
    return {
        "compare": False,
        "result": resp.model_dump(mode="json"),
        "summary": {
            "pieces_count": sum(p.qty for p in pieces),
            "sheets_used": len(resp.layout.sheets_used),
        },
    }
