"""Lectura de archivos nativos de Vectric Aspire (.crv3d).

El formato .crv3d es un Compound Document OLE2 propietario de Vectric. La
serialización interna del stream `VectorData/2dDataV2` es MFC `CArchive`
sin documentación pública, por lo que el parse directo de los contornos
2D no es viable de forma confiable.

Lo que SÍ es extraíble de manera robusta:
  - VersionData/Version            → versión de Aspire que escribió el archivo
  - VectorData/MaterialSize        → ancho · alto · espesor de la placa
  - VectorData/2dDataV2 (parcial)  → nombres de capas (UTF-16-LE escaneados)
  - PreviewData/Preview2D_GIF      → GIF preview embebido (apto como thumbnail)

Este módulo expone esa metadata y deja claro que el parse de contornos
requiere exportar a DXF desde Aspire (File → Export → DXF).
"""
from __future__ import annotations

import struct
from dataclasses import dataclass, field
from typing import Optional

try:
    import olefile
except ImportError as e:  # pragma: no cover - fallback informativo
    raise ImportError(
        "olefile no está instalado. Agregá `olefile` a requirements.txt."
    ) from e


CRV3D_OLE_MAGIC: bytes = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


@dataclass
class Crv3dMetadata:
    """Metadata extraída de un .crv3d sin parsear los vectores 2D."""
    aspire_version: Optional[str] = None
    material_width_mm: Optional[float] = None
    material_height_mm: Optional[float] = None
    material_thickness_mm: Optional[float] = None
    layer_names: list[str] = field(default_factory=list)
    has_preview_gif: bool = False
    streams: list[str] = field(default_factory=list)


class Crv3dExportRequiredError(NotImplementedError):
    """El .crv3d se reconoció pero requiere export a DXF para extraer contornos."""

    def __init__(self, metadata: Crv3dMetadata):
        self.metadata = metadata
        super().__init__(
            "Archivo .crv3d detectado. El parse de contornos 2D requiere "
            "exportar como DXF desde Aspire: File → Export → Vectors as DXF."
        )


def is_crv3d_file(path: str) -> bool:
    """Verifica magic bytes OLE2; no garantiza que sea Aspire."""
    try:
        with open(path, "rb") as f:
            return f.read(8) == CRV3D_OLE_MAGIC
    except OSError:
        return False


def _extract_utf16_pascal_strings(data: bytes) -> list[str]:
    """Escanea strings UTF-16-LE precedidos por `ff fe ff <len>` (formato Vectric)."""
    seen: set[str] = set()
    ordered: list[str] = []
    i = 0
    n = len(data)
    while i < n - 4:
        if data[i] == 0xFF and data[i + 1] == 0xFE and data[i + 2] == 0xFF:
            length = data[i + 3]
            start = i + 4
            end = start + length * 2
            if 1 <= length <= 64 and end <= n:
                try:
                    s = data[start:end].decode("utf-16-le")
                except UnicodeDecodeError:
                    i += 1
                    continue
                if s and all(c == "\t" or c >= " " for c in s) and s not in seen:
                    seen.add(s)
                    ordered.append(s)
                i = end
                continue
        i += 1
    return ordered


_VECTRIC_INTERNAL_LAYERS: frozenset[str] = frozenset({
    "Toolpath Previews",
    "Previsualiza Camino Herramienta",
    "Defpoints",
    "DXF_Z",
})


def _filter_layer_names(strings: list[str]) -> list[str]:
    """Filtra strings que no son nombres de capa (parámetros, clases internas)."""
    out: list[str] = []
    for s in strings:
        if s in _VECTRIC_INTERNAL_LAYERS:
            continue
        if s.startswith("vc") or s.startswith("ut") or s.startswith("vd"):
            continue
        out.append(s)
    return out


def _decode_version_string(data: bytes) -> Optional[str]:
    """Extrae 'Aspire X.Y' del stream VersionData/Version."""
    parts = _extract_utf16_pascal_strings(data)
    if not parts:
        return None
    product = next((p for p in parts if p in {"Aspire", "VCarve", "Cut2D", "PhotoVCarve"}), None)
    version = next((p for p in parts if any(c.isdigit() for c in p) and "." in p), None)
    if product and version:
        return f"{product} {version.strip()}"
    return product or (parts[0] if parts else None)


def _decode_material_size(data: bytes) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Escanea MaterialSize buscando los 3 doubles plausibles (W, H, espesor).

    Vectric escribe los doubles consecutivos pero el offset inicial varía
    según la versión. Probamos cada alineación de 0..7 y elegimos la que
    produzca tres lecturas válidas seguidas (1 negativo + 2 positivos).
    """
    def in_range(v: float) -> bool:
        return 0.5 <= abs(v) <= 10000

    for align in range(8):
        offsets = list(range(align, len(data) - 7, 8))
        seq: list[float] = []
        for off in offsets:
            try:
                v = struct.unpack_from("<d", data, off)[0]
            except struct.error:
                continue
            if in_range(v):
                seq.append(v)

        thickness = next((abs(v) for v in seq if v < 0), None)
        positives = [v for v in seq if v > 0]
        if thickness is not None and len(positives) >= 2:
            return positives[0], positives[1], thickness

    return None, None, None


def parse_aspire_crv3d_metadata(path: str) -> Crv3dMetadata:
    """Lee metadata de un .crv3d sin parsear los contornos 2D.

    Levanta:
        FileNotFoundError: si el path no existe.
        ValueError: si el archivo no es OLE2 (no es un .crv3d válido).
    """
    if not is_crv3d_file(path):
        raise ValueError(f"'{path}' no tiene firma OLE2 — no es un .crv3d válido")

    meta = Crv3dMetadata()
    ole = olefile.OleFileIO(path)
    try:
        meta.streams = ["/".join(s) for s in ole.listdir()]

        if ole.exists("VersionData/Version"):
            with ole.openstream("VersionData/Version") as s:
                meta.aspire_version = _decode_version_string(s.read())

        if ole.exists("VectorData/MaterialSize"):
            with ole.openstream("VectorData/MaterialSize") as s:
                w, h, t = _decode_material_size(s.read())
            meta.material_width_mm = w
            meta.material_height_mm = h
            meta.material_thickness_mm = t

        if ole.exists("VectorData/2dDataV2"):
            with ole.openstream("VectorData/2dDataV2") as s:
                strings = _extract_utf16_pascal_strings(s.read())
            meta.layer_names = _filter_layer_names(strings)

        meta.has_preview_gif = ole.exists("PreviewData/Preview2D_GIF")
    finally:
        ole.close()

    return meta


def extract_preview_gif(path: str) -> Optional[bytes]:
    """Devuelve los bytes del preview GIF embebido, o None si no existe."""
    if not is_crv3d_file(path):
        return None
    ole = olefile.OleFileIO(path)
    try:
        if not ole.exists("PreviewData/Preview2D_GIF"):
            return None
        with ole.openstream("PreviewData/Preview2D_GIF") as s:
            data = s.read()
        return data if data.startswith(b"GIF8") else None
    finally:
        ole.close()


def parse_aspire_crv3d(path: str, material_thickness: float) -> "ParseResult":  # noqa: F821
    """Stub que rechaza el parse directo y guía al usuario al export DXF.

    Retorna nunca; siempre levanta Crv3dExportRequiredError. La firma
    coincide con `parse_aspire_dxf` para mantener simetría aunque hoy no
    sea operable: si en el futuro Vectric publica el formato o aparece
    una librería de terceros, esta es la función a implementar.
    """
    metadata = parse_aspire_crv3d_metadata(path)
    raise Crv3dExportRequiredError(metadata)
