# Copyright (c) 2024-2026 Matías Marro. All rights reserved.
# m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
import ezdxf
from .models import Layout, Hole, HoleType, Face


# Capa DXF por tipo de taladro + color AutoCAD Color Index.
_HOLE_LAYERS = {
    HoleType.TARUGO:          ("TALADRO_TARUGO",      2),
    HoleType.MINIFIX_CARCASA: ("TALADRO_MINIFIX_15",  4),
    HoleType.MINIFIX_PERNO:   ("TALADRO_MINIFIX_5",   6),
    HoleType.TORNILLO:        ("TALADRO_3MM",         8),
}
_EDGE_MARK_LAYER = ("MARCA_CANTO", 6)

_HOLE_CODE = {
    HoleType.TARUGO: "T",
    HoleType.MINIFIX_CARCASA: "M",
    HoleType.MINIFIX_PERNO: "P",
    HoleType.TORNILLO: "S",
}
_EDGE_CODE = {
    Face.EDGE_LEFT: "L",
    Face.EDGE_RIGHT: "R",
    Face.EDGE_TOP: "T",
    Face.EDGE_BOTTOM: "B",
}

_MARK_SIZE = 6.0       # mm — tamaño de la cruz de marca
_MARK_ARROW = 8.0      # mm — longitud de la línea perpendicular al canto
_LABEL_H = 10.0        # mm — altura del texto


class DXFExporter:
    """Exporta Layout a DXF.

    Capas base: CONTORNO_PLACA, PIEZAS, ETIQUETAS, RETAZOS.
    Capas de taladro: TALADRO_* (una por tipo, solo si hay holes de ese tipo).
    Capa de marcas de canto: MARCA_CANTO (no cortable por Aspire).
    """

    GAP = 200

    @staticmethod
    def export(layout: Layout, path: str) -> None:
        doc = ezdxf.new("R2010")
        for name, color in [
            ("CONTORNO_PLACA", 7),
            ("PIEZAS", 3),
            ("ETIQUETAS", 1),
            ("RETAZOS", 5),
        ]:
            if name not in doc.layers:
                doc.layers.add(name, color=color)

        used_hole_types: set = set()
        needs_edge_layer = False
        for u in layout.sheets_used:
            for pl in u.placements:
                for h in pl.holes:
                    if h.face == Face.FACE_UP:
                        used_hole_types.add(h.type)
                    else:
                        needs_edge_layer = True
        for htype in used_hole_types:
            name, color = _HOLE_LAYERS[htype]
            if name not in doc.layers:
                doc.layers.add(name, color=color)
        if needs_edge_layer:
            name, color = _EDGE_MARK_LAYER
            if name not in doc.layers:
                doc.layers.add(name, color=color)

        msp = doc.modelspace()
        offset_x = 0.0

        for usage in layout.sheets_used:
            s = usage.sheet
            DXFExporter._rect(msp, offset_x, 0, s.width, s.height, "CONTORNO_PLACA")

            for pl in usage.placements:
                x0 = offset_x + pl.x
                y0 = pl.y
                DXFExporter._rect(msp, x0, y0, pl.width, pl.height, "PIEZAS")
                msp.add_text(
                    pl.piece_name,
                    dxfattribs={
                        "layer": "ETIQUETAS",
                        "height": 30,
                        "insert": (x0 + pl.width / 2, y0 + pl.height / 2),
                    },
                )
                for h in pl.holes:
                    DXFExporter._draw_hole(msp, h, x0, y0, pl.width, pl.height)

            for (x, y, w, h) in usage.free_rects:
                DXFExporter._rect(msp, offset_x + x, y, w, h, "RETAZOS")

            offset_x += s.width + DXFExporter.GAP

        doc.saveas(path)

    @staticmethod
    def _rect(msp, x, y, w, h, layer):
        msp.add_lwpolyline(
            [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)],
            close=True,
            dxfattribs={"layer": layer},
        )

    @staticmethod
    def _draw_hole(msp, hole: Hole, ox: float, oy: float, pw: float, ph: float) -> None:
        """Dibuja el hole en coords absolutas; ox,oy = esquina inf-izq de la pieza."""
        cx = ox + hole.x
        cy = oy + hole.y

        if hole.face == Face.FACE_UP:
            layer = _HOLE_LAYERS[hole.type][0]
            msp.add_circle((cx, cy), radius=hole.diameter / 2,
                           dxfattribs={"layer": layer})
            return

        # Canto: marca visual.
        layer = _EDGE_MARK_LAYER[0]
        s = _MARK_SIZE / 2
        # Cruz.
        msp.add_line((cx - s, cy), (cx + s, cy), dxfattribs={"layer": layer})
        msp.add_line((cx, cy - s), (cx, cy + s), dxfattribs={"layer": layer})
        # Línea perpendicular al canto apuntando hacia afuera.
        dx, dy = DXFExporter._edge_outward(hole.face)
        ex, ey = cx + dx * _MARK_ARROW, cy + dy * _MARK_ARROW
        msp.add_line((cx, cy), (ex, ey), dxfattribs={"layer": layer})
        # Etiqueta: {tipo}{diam}@{canto}, desplazada hacia el interior.
        code = f"{_HOLE_CODE[hole.type]}{int(round(hole.diameter))}@{_EDGE_CODE[hole.face]}"
        tx, ty = cx - dx * (_MARK_ARROW + 2), cy - dy * (_MARK_ARROW + 2)
        msp.add_text(
            code,
            dxfattribs={
                "layer": layer,
                "height": _LABEL_H,
                "insert": (tx, ty),
            },
        )

    @staticmethod
    def _edge_outward(face: Face) -> tuple:
        if face == Face.EDGE_LEFT:
            return (-1.0, 0.0)
        if face == Face.EDGE_RIGHT:
            return (1.0, 0.0)
        if face == Face.EDGE_BOTTOM:
            return (0.0, -1.0)
        if face == Face.EDGE_TOP:
            return (0.0, 1.0)
        return (0.0, 0.0)
