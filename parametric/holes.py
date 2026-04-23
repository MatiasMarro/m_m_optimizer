"""Generación de perforaciones para uniones de carpintería.

Convenciones:
- Coords locales (x, y) de cada `Hole` relativas a la esquina inf-izq de la
  pieza tal como entra al nester (width × height).
- Holes de cara (FACE_UP): se dibujan como círculos reales en el DXF.
- Holes de canto (EDGE_*): su (x, y) es la *proyección* sobre la cara; en el
  DXF se dibujan como marca visual en la capa MARCA_CANTO.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Literal

from nesting.models import Hole, HoleType, Face


# ---------- Parámetros estándar ----------
TARUGO_D = 8.0
TARUGO_DEPTH = 12.0
MINIFIX_CARCASA_D = 15.0
MINIFIX_CARCASA_DEPTH = 12.0
MINIFIX_PERNO_D = 5.0
TORNILLO_D = 3.0

# Sistema 32: offset estándar desde canto para fila de tarugos
SYS32_OFFSET = 37.0


class JunctionHardware(Enum):
    TARUGO = "tarugo"
    MINIFIX = "minifix"
    TORNILLO = "tornillo"


@dataclass
class HardwareConfig:
    """Herraje por tipo de unión en el mueble."""
    union_laterales: JunctionHardware = JunctionHardware.MINIFIX
    union_estantes: JunctionHardware = JunctionHardware.TARUGO
    # Offset desde canto frontal/trasero para primer y segundo punto de fijación
    offset_front: float = SYS32_OFFSET
    offset_back: float = SYS32_OFFSET


# ---------- Helpers de construcción ----------
def _hole_face_for(hardware: JunctionHardware, role: Literal["face", "edge"]) -> tuple[HoleType, float, float]:
    """Retorna (type, diameter, depth) según herraje y lado del contacto."""
    if hardware == JunctionHardware.TARUGO:
        return HoleType.TARUGO, TARUGO_D, TARUGO_DEPTH
    if hardware == JunctionHardware.MINIFIX:
        if role == "face":
            return HoleType.MINIFIX_CARCASA, MINIFIX_CARCASA_D, MINIFIX_CARCASA_DEPTH
        return HoleType.MINIFIX_PERNO, MINIFIX_PERNO_D, -1.0
    # TORNILLO
    return HoleType.TORNILLO, TORNILLO_D, -1.0


def junction_face_holes(
    y_center: float,
    depth_axis_length: float,
    hardware: JunctionHardware,
    offset_front: float = SYS32_OFFSET,
    offset_back: float = SYS32_OFFSET,
) -> List[Hole]:
    """Dos agujeros en cara, alineados a lo largo del eje 'depth'.

    Se ubican en x=offset_front y x=(depth_axis_length - offset_back),
    todos a y=y_center.
    """
    htype, d, depth = _hole_face_for(hardware, "face")
    return [
        Hole(x=offset_front, y=y_center, diameter=d, depth=depth,
             type=htype, face=Face.FACE_UP),
        Hole(x=depth_axis_length - offset_back, y=y_center, diameter=d, depth=depth,
             type=htype, face=Face.FACE_UP),
    ]


def junction_edge_holes(
    edge: Face,
    positions: List[float],
    piece_width: float,
    piece_height: float,
    hardware: JunctionHardware,
) -> List[Hole]:
    """Agujeros en canto. `positions` son las coords a lo largo del canto.

    Para EDGE_LEFT/RIGHT: positions son valores de y.
    Para EDGE_BOTTOM/TOP: positions son valores de x.
    """
    htype, d, depth = _hole_face_for(hardware, "edge")
    holes = []
    for p in positions:
        if edge == Face.EDGE_LEFT:
            x, y = 0.0, p
        elif edge == Face.EDGE_RIGHT:
            x, y = piece_width, p
        elif edge == Face.EDGE_BOTTOM:
            x, y = p, 0.0
        elif edge == Face.EDGE_TOP:
            x, y = p, piece_height
        else:
            raise ValueError(f"edge debe ser EDGE_*, no {edge}")
        holes.append(Hole(x=x, y=y, diameter=d, depth=depth, type=htype, face=edge))
    return holes


