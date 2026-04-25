"""Parser de DXF exportado por Vectric Aspire.

Aspire codifica profundidad de mecanizado en Z (entity.dxf.elevation
o coordenada Z del primer vértice), no en posición 3D real. Este módulo
extrae contornos 2D + profundidad + tipo de operación desde el layer
y la geometría.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import ezdxf
from ezdxf.lldxf.const import DXFError, DXFStructureError


class OperationType(str, Enum):
    PROFILE = "profile"
    POCKET = "pocket"
    DRILL = "drill"
    GROOVE = "groove"
    REFERENCE = "reference"


@dataclass
class ParsedContour:
    layer: str
    op_type: OperationType
    vertices: list[tuple[float, float]]
    bbox: tuple[float, float, float, float]
    width: float
    height: float
    depth: float
    tool_diameter: Optional[float] = None
    is_through_cut: bool = False


@dataclass
class TextAnnotation:
    """Texto/cota suelto en el DXF (TEXT, MTEXT, DIMENSION)."""
    layer: str
    text: str
    x: float
    y: float
    height: float
    kind: str  # "text" | "mtext" | "dimension"


@dataclass
class ParseResult:
    contours: list[ParsedContour]
    layer_summary: dict[str, int] = field(default_factory=dict)
    unrecognized_entities: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    text_annotations: list[TextAnnotation] = field(default_factory=list)


_IGNORED_TYPES = frozenset({"INSERT", "HATCH"})
_TEXT_TYPES = frozenset({"TEXT", "MTEXT", "DIMENSION"})
_PROCESSABLE_TYPES = frozenset(
    {"LWPOLYLINE", "POLYLINE", "CIRCLE", "SPLINE", "LINE", "ARC"}
)

_TOOL_DIAMETER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"_(\d+(?:\.\d+)?)\s*mm\b", re.IGNORECASE),
    re.compile(r"_D(\d+(?:\.\d+)?)\b", re.IGNORECASE),
    re.compile(r"\bdiam?(\d+(?:\.\d+)?)", re.IGNORECASE),
    re.compile(r"\bfresa[_\s]*(\d+(?:\.\d+)?)", re.IGNORECASE),
)

_LAYER_KEYWORDS: tuple[tuple[OperationType, tuple[str, ...]], ...] = (
    (OperationType.DRILL, ("drill", "tarugo", "dowel", "minifix", "confirmat", "agujero", "hole")),
    (OperationType.POCKET, ("pocket", "cajeo", "cajeado", "groove", "ranura", "vaciado", "rebaje")),
    (OperationType.REFERENCE, ("ref", "reference", "marca", "guia", "guide", "cota", "dimension")),
    (OperationType.PROFILE, ("profile", "perfil", "corte", "cut", "contorno", "outline")),
)


def extract_tool_diameter(layer_name: str) -> Optional[float]:
    """Extrae diámetro de herramienta del nombre de capa (p. ej. _6mm, _D8, dia6, fresa6)."""
    for pattern in _TOOL_DIAMETER_PATTERNS:
        match = pattern.search(layer_name)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                continue
    return None


def classify_layer(layer_name: str) -> Optional[OperationType]:
    """Clasifica tipo de operación según keywords en el nombre de capa."""
    normalized = layer_name.lower().strip().replace(" ", "_").replace("-", "_")
    for op_type, keywords in _LAYER_KEYWORDS:
        for kw in keywords:
            if kw in normalized:
                return op_type
    return None


def _get_entity_z(entity) -> float:
    """Obtiene la coordenada Z relevante de la entidad; 0.0 si no se puede determinar."""
    try:
        elevation = getattr(entity.dxf, "elevation", None)
        if elevation is not None and elevation != 0:
            return float(elevation)
    except Exception:
        pass

    entity_type = entity.dxftype()

    try:
        if entity_type == "CIRCLE" or entity_type == "ARC":
            return float(entity.dxf.center[2])
        if entity_type == "LINE":
            z_start = float(entity.dxf.start[2])
            z_end = float(entity.dxf.end[2])
            return z_start if abs(z_start) >= abs(z_end) else z_end
        if entity_type == "LWPOLYLINE":
            elevation = getattr(entity.dxf, "elevation", 0.0)
            return float(elevation)
        if entity_type == "POLYLINE":
            verts = list(entity.points())
            if verts and len(verts[0]) >= 3:
                return float(verts[0][2])
        if entity_type == "SPLINE":
            try:
                control_points = list(entity.control_points)
                if control_points:
                    return float(control_points[0][2])
            except Exception:
                pass
            try:
                fit_points = list(entity.fit_points)
                if fit_points:
                    return float(fit_points[0][2])
            except Exception:
                pass
    except Exception:
        pass

    return 0.0


def classify_entity(entity, layer_name: str, material_thickness: float) -> OperationType:
    """Clasifica una entidad DXF: primero por layer, luego por geometría/Z."""
    layer_classification = classify_layer(layer_name)
    if layer_classification is not None:
        return layer_classification

    entity_type = entity.dxftype()

    if entity_type == "CIRCLE":
        z = _get_entity_z(entity)
        return OperationType.DRILL if abs(z) > 0.5 else OperationType.REFERENCE

    if entity_type in {"LWPOLYLINE", "POLYLINE", "SPLINE", "LINE", "ARC"}:
        z = _get_entity_z(entity)
        if abs(z) >= material_thickness * 0.85:
            return OperationType.PROFILE
        if abs(z) > 0.5:
            return OperationType.POCKET
        return OperationType.PROFILE

    return OperationType.REFERENCE


def _is_lwpolyline_closed(entity) -> bool:
    try:
        return bool(entity.closed)
    except AttributeError:
        try:
            return bool(entity.dxf.flags & 1)
        except AttributeError:
            return False


def entity_to_vertices(entity) -> list[tuple[float, float]]:
    """Convierte una entidad DXF a lista de vértices 2D (x, y)."""
    entity_type = entity.dxftype()

    try:
        if entity_type == "LWPOLYLINE":
            pts = [(float(p[0]), float(p[1])) for p in entity.get_points()]
            if _is_lwpolyline_closed(entity) and pts and pts[0] != pts[-1]:
                pts.append(pts[0])
            return pts

        if entity_type == "POLYLINE":
            return [(float(p[0]), float(p[1])) for p in entity.points()]

        if entity_type == "CIRCLE":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            cx, cy = float(center[0]), float(center[1])
            segments = 32
            return [
                (cx + radius * math.cos(2 * math.pi * i / segments),
                 cy + radius * math.sin(2 * math.pi * i / segments))
                for i in range(segments)
            ]

        if entity_type == "SPLINE":
            flat = entity.flattening(0.01)
            return [(float(p[0]), float(p[1])) for p in flat]

        if entity_type == "LINE":
            start, end = entity.dxf.start, entity.dxf.end
            return [(float(start[0]), float(start[1])), (float(end[0]), float(end[1]))]

        if entity_type == "ARC":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            start_angle = math.radians(float(entity.dxf.start_angle))
            end_angle = math.radians(float(entity.dxf.end_angle))
            if end_angle < start_angle:
                end_angle += 2 * math.pi
            cx, cy = float(center[0]), float(center[1])
            segments = 16
            return [
                (cx + radius * math.cos(start_angle + (end_angle - start_angle) * i / segments),
                 cy + radius * math.sin(start_angle + (end_angle - start_angle) * i / segments))
                for i in range(segments + 1)
            ]
    except Exception:
        return []

    return []


def compute_bbox(vertices: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Calcula bounding box (x_min, y_min, x_max, y_max) de una lista de vértices."""
    if not vertices:
        raise ValueError("Cannot compute bbox from empty vertices list")
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    return (min(xs), min(ys), max(xs), max(ys))


_OVERSIZED_MAX_W: float = 1830.0  # placa estándar W
_OVERSIZED_MAX_H: float = 2440.0  # placa estándar H
_DUPLICATE_TOL_MM: float = 1.0    # tolerancia para considerar dos contornos "iguales"


def _extract_text_annotation(entity, layer_name: str) -> Optional["TextAnnotation"]:
    """Extrae TextAnnotation de TEXT/MTEXT/DIMENSION; None si falla."""
    entity_type = entity.dxftype()
    try:
        if entity_type == "TEXT":
            text = str(getattr(entity.dxf, "text", "")).strip()
            insert = entity.dxf.insert
            height = float(getattr(entity.dxf, "height", 0.0))
            return TextAnnotation(
                layer=layer_name, text=text,
                x=float(insert[0]), y=float(insert[1]),
                height=height, kind="text",
            )
        if entity_type == "MTEXT":
            text = entity.text if hasattr(entity, "text") else str(getattr(entity.dxf, "text", ""))
            text = str(text).replace("\\P", " ").strip()
            insert = entity.dxf.insert
            height = float(getattr(entity.dxf, "char_height", 0.0))
            return TextAnnotation(
                layer=layer_name, text=text,
                x=float(insert[0]), y=float(insert[1]),
                height=height, kind="mtext",
            )
        if entity_type == "DIMENSION":
            text = str(getattr(entity.dxf, "text", "") or "").strip()
            # DIMENSION puede tener defpoint; uso defpoint o text_midpoint
            try:
                pt = entity.dxf.text_midpoint
            except AttributeError:
                pt = getattr(entity.dxf, "defpoint", (0, 0, 0))
            return TextAnnotation(
                layer=layer_name, text=text,
                x=float(pt[0]), y=float(pt[1]),
                height=0.0, kind="dimension",
            )
    except Exception:
        return None
    return None


def detect_quality_issues(
    contours: list["ParsedContour"],
    layer_summary: dict[str, int],
    standard_w: float = _OVERSIZED_MAX_W,
    standard_h: float = _OVERSIZED_MAX_H,
) -> list[str]:
    """Heurísticas que NO requieren IA: duplicados, oversized, layers raros.

    Devuelve lista de warnings agregables al `ParseResult.warnings`.
    """
    issues: list[str] = []

    # 1) Layers sin contornos PROFILE (sólo drills/pockets/etc.) — útil saberlo
    profile_layers: set[str] = set()
    for c in contours:
        if c.op_type == OperationType.PROFILE:
            profile_layers.add(c.layer)
    no_profile = [l for l in layer_summary if l not in profile_layers]
    if no_profile and len(no_profile) <= 6:
        issues.append(
            f"Layers sin contornos PROFILE (no se convertirán a piezas): {', '.join(no_profile)}"
        )
    elif len(no_profile) > 6:
        issues.append(
            f"{len(no_profile)} layers sin contornos PROFILE (revisá clasificación)"
        )

    # 2) Piezas más grandes que la placa estándar
    profiles = [c for c in contours if c.op_type == OperationType.PROFILE]
    for c in profiles:
        too_wide = c.width > standard_w and c.width > standard_h
        too_tall = c.height > standard_w and c.height > standard_h
        if too_wide or too_tall:
            issues.append(
                f"Pieza en '{c.layer}' ({c.width:.0f}×{c.height:.0f}mm) excede "
                f"placa estándar {standard_w:.0f}×{standard_h:.0f}mm"
            )

    # 3) Contornos PROFILE duplicados exactos en mismo layer (posible error de export)
    seen: dict[tuple, int] = {}
    for c in profiles:
        key = (
            c.layer,
            round(c.width / _DUPLICATE_TOL_MM),
            round(c.height / _DUPLICATE_TOL_MM),
            round(c.bbox[0] / _DUPLICATE_TOL_MM),
            round(c.bbox[1] / _DUPLICATE_TOL_MM),
        )
        seen[key] = seen.get(key, 0) + 1
    for (layer, _, _, _, _), n in seen.items():
        if n >= 2:
            issues.append(
                f"{n} contornos PROFILE superpuestos en mismo lugar del layer '{layer}' "
                f"(posible duplicado del export)"
            )

    return issues


def parse_aspire_dxf(filepath: str, material_thickness: float = 18.0) -> ParseResult:
    """Parsea un DXF exportado por Vectric Aspire en contornos clasificados."""
    result = ParseResult(contours=[])

    try:
        doc = ezdxf.readfile(filepath)
    except FileNotFoundError:
        raise
    except (DXFStructureError, DXFError) as e:
        raise DXFStructureError(f"Invalid DXF structure in '{filepath}': {e}") from e
    except IOError as e:
        raise IOError(f"Could not read DXF file '{filepath}': {e}") from e

    mspace = doc.modelspace()

    for entity in mspace:
        entity_type = entity.dxftype()
        layer_name = entity.dxf.layer

        if entity_type in _IGNORED_TYPES:
            if entity_type not in result.unrecognized_entities:
                result.unrecognized_entities.append(entity_type)
            continue

        if entity_type in _TEXT_TYPES:
            ann = _extract_text_annotation(entity, layer_name)
            if ann is not None:
                result.text_annotations.append(ann)
            continue

        if entity_type not in _PROCESSABLE_TYPES:
            if entity_type not in result.unrecognized_entities:
                result.unrecognized_entities.append(entity_type)
            continue

        result.layer_summary[layer_name] = result.layer_summary.get(layer_name, 0) + 1

        vertices = entity_to_vertices(entity)
        if not vertices:
            result.warnings.append(
                f"Could not extract vertices from {entity_type} on layer '{layer_name}'"
            )
            continue

        try:
            bbox = compute_bbox(vertices)
        except ValueError as e:
            result.warnings.append(str(e))
            continue

        x_min, y_min, x_max, y_max = bbox
        width = x_max - x_min
        height = y_max - y_min

        op_type = classify_entity(entity, layer_name, material_thickness)

        z = _get_entity_z(entity)
        depth = abs(z)
        is_through = abs(z) >= material_thickness * 0.85

        if entity_type == "CIRCLE":
            try:
                tool_diameter: Optional[float] = float(entity.dxf.radius) * 2.0
            except AttributeError:
                tool_diameter = extract_tool_diameter(layer_name)
        else:
            tool_diameter = extract_tool_diameter(layer_name)

        result.contours.append(
            ParsedContour(
                layer=layer_name,
                op_type=op_type,
                vertices=vertices,
                bbox=bbox,
                width=width,
                height=height,
                depth=depth,
                tool_diameter=tool_diameter,
                is_through_cut=is_through,
            )
        )

    # Heurísticas post-parse — agregadas como warnings sin romper el flow.
    result.warnings.extend(detect_quality_issues(result.contours, result.layer_summary))

    return result
