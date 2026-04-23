from dataclasses import dataclass
from typing import List

from nesting.models import Piece, Face
from .base import Furniture, SHELF_INSET
from .holes import junction_face_holes, junction_edge_holes


@dataclass
class Cabinet(Furniture):
    num_estantes: int = 1
    con_fondo: bool = True

    def __post_init__(self):
        super().__post_init__()
        if self.num_estantes < 0:
            raise ValueError("num_estantes < 0")
        if self.alto <= (self.num_estantes + 2) * self.espesor:
            raise ValueError("alto insuficiente para tapa+base+estantes")

    def get_pieces(self) -> List[Piece]:
        e = self.espesor
        prof = self.profundidad
        alto = self.alto
        ancho_interno = self.ancho - 2 * e
        hw = self.hardware

        lateral = Piece("lateral", prof, alto, qty=2, grain_locked=True)
        tapa = Piece("tapa", ancho_interno, prof, qty=1)
        base = Piece("base", ancho_interno, prof, qty=1)

        # ---- Uniones lateral ↔ tapa/base ----
        # Lateral (width=prof, height=alto): taladros en FACE_UP.
        lateral.holes += junction_face_holes(
            y_center=alto - e / 2,
            depth_axis_length=prof,
            hardware=hw.union_laterales,
            offset_front=hw.offset_front, offset_back=hw.offset_back,
        )
        lateral.holes += junction_face_holes(
            y_center=e / 2,
            depth_axis_length=prof,
            hardware=hw.union_laterales,
            offset_front=hw.offset_front, offset_back=hw.offset_back,
        )
        # Tapa/base (width=ancho_interno, height=prof): marcas en EDGE_LEFT y EDGE_RIGHT.
        side_positions = [hw.offset_front, prof - hw.offset_back]
        for piece in (tapa, base):
            piece.holes += junction_edge_holes(
                Face.EDGE_LEFT, side_positions,
                ancho_interno, prof, hw.union_laterales,
            )
            piece.holes += junction_edge_holes(
                Face.EDGE_RIGHT, side_positions,
                ancho_interno, prof, hw.union_laterales,
            )

        pieces: List[Piece] = [lateral, tapa, base]

        # ---- Uniones lateral ↔ estantes ----
        if self.num_estantes > 0:
            estante_h = prof - SHELF_INSET  # estante back-alineado, recortado en frente
            estante = Piece("estante", ancho_interno, estante_h, qty=self.num_estantes)

            # Offsets lateral para estante: front sale del frente de estante (SHELF_INSET + offset_front)
            lat_off_front = SHELF_INSET + hw.offset_front
            lat_off_back = hw.offset_back
            est_positions = [hw.offset_front, estante_h - hw.offset_back]

            for k in range(1, self.num_estantes + 1):
                y_k = e + (alto - 2 * e) * k / (self.num_estantes + 1)
                lateral.holes += junction_face_holes(
                    y_center=y_k,
                    depth_axis_length=prof,
                    hardware=hw.union_estantes,
                    offset_front=lat_off_front, offset_back=lat_off_back,
                )

            estante.holes += junction_edge_holes(
                Face.EDGE_LEFT, est_positions,
                ancho_interno, estante_h, hw.union_estantes,
            )
            estante.holes += junction_edge_holes(
                Face.EDGE_RIGHT, est_positions,
                ancho_interno, estante_h, hw.union_estantes,
            )
            pieces.append(estante)

        if self.con_fondo:
            pieces.append(Piece(
                "fondo",
                ancho_interno,
                alto - 2 * e,
                qty=1,
            ))
        return pieces
