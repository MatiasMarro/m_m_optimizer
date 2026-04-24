"""Router FastAPI para import de DXF + imágenes de referencia de muebles."""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import List, Optional

import matplotlib

matplotlib.use("Agg")

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.app.dxf.parser import parse_aspire_dxf

DATA_DIR: Path = Path(__file__).resolve().parents[3] / "data"
FURNITURE_DIR: Path = DATA_DIR / "furniture"

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


def cache_parsed_data(parsed_result, furniture_dir: Path) -> None:
    """Serializa ParseResult a furniture_dir/parsed.json (silencia errores)."""
    try:
        contours = []
        for c in parsed_result.contours:
            d = asdict(c) if is_dataclass(c) else dict(c)
            if "op_type" in d and hasattr(d["op_type"], "value"):
                d["op_type"] = d["op_type"].value
            contours.append(d)
        payload = {
            "contours": contours,
            "layer_summary": dict(parsed_result.layer_summary),
            "unrecognized_entities": list(parsed_result.unrecognized_entities),
            "warnings": list(parsed_result.warnings),
        }
        (furniture_dir / "parsed.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        pass


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

    cache_parsed_data(parsed, furniture_dir)

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
