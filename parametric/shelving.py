from dataclasses import dataclass
from typing import List

from nesting.models import Piece, Face
from .base import Furniture, SHELF_INSET
from .holes import junction_face_holes, junction_edge_holes


@dataclass
class ShelvingUnit(Furniture):
    num_estantes: int = 3

    def __post_init__(self):
        super().__post_init__()
        if self.num_estantes < 1:
            raise ValueError("num_estantes < 1")
        if self.alto <= self.num_estantes * self.espesor:
            raise ValueError("alto insuficiente para estantes")

    def get_pieces(self) -> List[Piece]:
        e = self.espesor
        prof = self.profundidad
        alto = self.alto
        ancho_interno = self.ancho - 2 * e
        hw = self.hardware

        lateral = Piece("lateral", prof, alto, qty=2, grain_locked=True)
        estante_h = prof - SHELF_INSET
        estante = Piece("estante", ancho_interno, estante_h, qty=self.num_estantes)

        lat_off_front = SHELF_INSET + hw.offset_front
        lat_off_back = hw.offset_back
        est_positions = [hw.offset_front, estante_h - hw.offset_back]

        for k in range(1, self.num_estantes + 1):
            y_k = alto * k / (self.num_estantes + 1)
            lateral.holes += junction_face_holes(
                y_center=y_k,
                depth_axis_length=prof,
                hardware=hw.union_estantes,
                offset_front=lat_off_front, offset_back=lat_off_back,
            )

        estante.holes += junction_edge_holes(
            Face.EDGE_LEFT, est_positions, ancho_interno, estante_h, hw.union_estantes,
        )
        estante.holes += junction_edge_holes(
            Face.EDGE_RIGHT, est_positions, ancho_interno, estante_h, hw.union_estantes,
        )

        return [lateral, estante]
