from typing import List, Optional

from nesting.config import KERF
from nesting.models import Layout, Piece

from . import config as cfg
from .models import CostBreakdown, HardwareItem


class CostCalculator:
    """Calcula costo total a partir de un Layout de nesting + piezas originales.

    El Layout aporta: placas consumidas (std/retazo) y perímetro de corte.
    Las piezas aportan: metros de tapacanto (según `edged`).
    """

    def __init__(
        self,
        precio_placa: float = cfg.PRECIO_PLACA_MDF_18,
        factor_retazo: float = cfg.FACTOR_VALOR_RETAZO,
        precio_tapacanto_m: float = cfg.PRECIO_TAPACANTO_M,
        costo_hora_cnc: float = cfg.COSTO_HORA_CNC,
        velocidad_corte: float = cfg.VELOCIDAD_CORTE_MM_MIN,
        costo_hora_mo: float = cfg.COSTO_HORA_MO,
        margen: float = cfg.MARGEN,
        kerf: float = KERF,
    ):
        self.precio_placa = precio_placa
        self.factor_retazo = factor_retazo
        self.precio_tapacanto_m = precio_tapacanto_m
        self.costo_hora_cnc = costo_hora_cnc
        self.velocidad_corte = velocidad_corte
        self.costo_hora_mo = costo_hora_mo
        self.margen = margen
        self.kerf = kerf

    def compute(
        self,
        layout: Layout,
        pieces: List[Piece],
        horas_mo: float = cfg.HORAS_MO_DEFAULT,
        herrajes: Optional[List[HardwareItem]] = None,
    ) -> CostBreakdown:
        b = CostBreakdown()
        b.horas_mo = horas_mo
        b.detalle_herrajes = herrajes or []

        self._costear_material(layout, b)
        self._costear_tapacanto(pieces, b)
        self._costear_cnc(layout, b)
        b.mano_obra = horas_mo * self.costo_hora_mo
        b.herrajes = sum(h.total for h in b.detalle_herrajes)
        b.margen = b.subtotal * self.margen
        return b

    # ---------- rubros ----------
    def _costear_material(self, layout: Layout, b: CostBreakdown) -> None:
        for u in layout.sheets_used:
            if u.sheet.is_offcut:
                area = u.sheet.width * u.sheet.height
                # $/mm² referido a placa estándar; asumimos misma densidad de precio
                precio_mm2 = self.precio_placa / self._ref_area(layout)
                b.material_retazos += area * precio_mm2 * self.factor_retazo
                b.retazos_consumidos += 1
            else:
                b.material_placas += self.precio_placa
                b.placas_nuevas += 1

    def _ref_area(self, layout: Layout) -> float:
        # Área de placa estándar (tomada de la primera no-retazo; si no hay, asume 1830x2440)
        for u in layout.sheets_used:
            if not u.sheet.is_offcut:
                return u.sheet.width * u.sheet.height
        return 1830.0 * 2440.0

    def _costear_tapacanto(self, pieces: List[Piece], b: CostBreakdown) -> None:
        total_mm = 0.0
        for p in pieces:
            top, right, bottom, left = p.edged
            side_mm = (
                (p.width if top else 0)
                + (p.height if right else 0)
                + (p.width if bottom else 0)
                + (p.height if left else 0)
            )
            total_mm += side_mm * p.qty
        metros = total_mm / 1000.0
        b.metros_tapacanto = metros
        b.tapacanto = metros * self.precio_tapacanto_m

    def _costear_cnc(self, layout: Layout, b: CostBreakdown) -> None:
        # Longitud de corte = suma de perímetros menos cortes compartidos entre
        # piezas adyacentes (separadas exactamente por `kerf`): ese borde se
        # recorre una sola vez, no dos.
        tol = 1e-3  # mm
        perim_mm = 0.0

        for u in layout.sheets_used:
            pls = u.placements
            for pl in pls:
                perim_mm += 2.0 * (pl.width + pl.height)

            n = len(pls)
            for i in range(n):
                for j in range(i + 1, n):
                    a, c = pls[i], pls[j]

                    # Adyacencia horizontal: a está a la izquierda de c
                    if abs((a.x + a.width + self.kerf) - c.x) < tol:
                        overlap = min(a.y + a.height, c.y + c.height) - max(a.y, c.y)
                        if overlap > tol:
                            perim_mm -= overlap
                    elif abs((c.x + c.width + self.kerf) - a.x) < tol:
                        overlap = min(a.y + a.height, c.y + c.height) - max(a.y, c.y)
                        if overlap > tol:
                            perim_mm -= overlap

                    # Adyacencia vertical: a está debajo de c
                    if abs((a.y + a.height + self.kerf) - c.y) < tol:
                        overlap = min(a.x + a.width, c.x + c.width) - max(a.x, c.x)
                        if overlap > tol:
                            perim_mm -= overlap
                    elif abs((c.y + c.height + self.kerf) - a.y) < tol:
                        overlap = min(a.x + a.width, c.x + c.width) - max(a.x, c.x)
                        if overlap > tol:
                            perim_mm -= overlap

        minutos = perim_mm / self.velocidad_corte if self.velocidad_corte else 0.0
        b.minutos_cnc = minutos
        b.tiempo_cnc = (minutos / 60.0) * self.costo_hora_cnc
