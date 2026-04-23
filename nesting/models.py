from dataclasses import dataclass, field
from enum import Enum
from typing import List, Tuple


class HoleType(Enum):
    TARUGO = "tarugo"                    # ø8 prof 12
    MINIFIX_CARCASA = "minifix_carcasa"  # ø15 prof 12
    MINIFIX_PERNO = "minifix_perno"      # ø5 pasante
    TORNILLO = "tornillo"                # ø3 pasante


class Face(Enum):
    FACE_UP = "face_up"        # cara drilada (la que ve el CNC)
    FACE_DOWN = "face_down"
    EDGE_LEFT = "edge_left"    # canto en x=0
    EDGE_RIGHT = "edge_right"  # canto en x=width
    EDGE_BOTTOM = "edge_bottom"  # canto en y=0
    EDGE_TOP = "edge_top"      # canto en y=height


@dataclass
class Hole:
    x: float
    y: float
    diameter: float
    depth: float          # -1 = pasante
    type: HoleType
    face: Face = Face.FACE_UP


_EDGE_ROT_CW = {
    Face.EDGE_LEFT: Face.EDGE_TOP,
    Face.EDGE_TOP: Face.EDGE_RIGHT,
    Face.EDGE_RIGHT: Face.EDGE_BOTTOM,
    Face.EDGE_BOTTOM: Face.EDGE_LEFT,
    Face.FACE_UP: Face.FACE_UP,
    Face.FACE_DOWN: Face.FACE_DOWN,
}


def rotate_hole_cw(hole: "Hole", orig_width: float) -> "Hole":
    """Rota un Hole 90° CW. Pieza W×H → H×W. (x, y) → (y, W - x)."""
    return Hole(
        x=hole.y,
        y=orig_width - hole.x,
        diameter=hole.diameter,
        depth=hole.depth,
        type=hole.type,
        face=_EDGE_ROT_CW[hole.face],
    )


@dataclass
class Piece:
    name: str
    width: float
    height: float
    qty: int = 1
    grain_locked: bool = False
    # (top, right, bottom, left) — cantos con tapacanto aplicado
    edged: Tuple[bool, bool, bool, bool] = (False, False, False, False)
    holes: List[Hole] = field(default_factory=list)


@dataclass
class Sheet:
    id: str
    width: float
    height: float
    thickness: float = 18
    is_offcut: bool = False


@dataclass
class PlacedPiece:
    piece_name: str
    sheet_id: str
    x: float
    y: float
    width: float
    height: float
    rotated: bool = False
    holes: List[Hole] = field(default_factory=list)


@dataclass
class SheetUsage:
    sheet: Sheet
    placements: List[PlacedPiece] = field(default_factory=list)
    free_rects: List[tuple] = field(default_factory=list)  # (x, y, w, h)


@dataclass
class Layout:
    sheets_used: List[SheetUsage]
    unplaced: List[Piece]
    efficiency: float
    new_offcuts: List[Sheet]
