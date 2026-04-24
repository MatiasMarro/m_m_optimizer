"""Router FastAPI para import de DXF + imágenes de referencia de muebles."""
from __future__ import annotations

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
from backend.app.dxf.parser import parse_aspire_dxf
from backend.app.repositories import furniture_repo

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
    """Valida extensión .dxf y guarda el archivo como original.dxf."""
    if not filename.lower().endswith(".dxf"):
        raise HTTPException(status_code=400, detail="Archivo DXF con extensión inválida")
    out_path = furniture_dir / "original.dxf"
    out_path.write_bytes(content)
    return "original.dxf"


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
    return {
        "contours": contours,
        "layer_summary": dict(parsed_result.layer_summary),
        "unrecognized_entities": list(parsed_result.unrecognized_entities),
        "warnings": list(parsed_result.warnings),
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

    images_count, warnings = await save_reference_images(reference_images, furniture_dir)

    thumb_path = furniture_dir / "thumb.jpg"
    if not generate_dxf_thumbnail(dxf_path, thumb_path):
        warnings.append("No thumbnail generado")

    try:
        parsed = parse_aspire_dxf(str(dxf_path), material_thickness)
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
        contours_count = len(parsed.get("contours") or [])
        try:
            piece_roles = json.loads(r.piece_roles) if r.piece_roles else {}
        except (TypeError, json.JSONDecodeError):
            piece_roles = {}
        out.append({
            "furniture_id": r.id,
            "name": r.name,
            "thumbnail_url": f"/api/furniture/{r.id}/thumbnail",
            "contours_count": contours_count,
            "layers": layers,
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

    return {
        "furniture_id": row.id,
        "name": row.name,
        "thumbnail_url": f"/api/furniture/{row.id}/thumbnail",
        "material_thickness": row.material_thickness,
        "version": row.version,
        "pieces": pieces,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


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
