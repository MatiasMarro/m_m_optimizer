# Copyright (c) 2024-2026 Matías Marro. All rights reserved.
# m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
"""Entry point del optimizador CNC.

Orquesta: parametric → nesting → costing → export DXF.
`run_pipeline` es la API pura reutilizable por una GUI futura.
La CLI (main) es una envoltura fina sobre esa función.
"""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from parametric import Cabinet, Furniture, ShelvingUnit
from nesting import NestingOptimizer, OffcutInventory, DXFExporter, Sheet
from nesting.config import STANDARD_SHEET_W, STANDARD_SHEET_H
import nesting.config as cfg_nesting
from nesting.models import Layout, Piece
from costing import CostBreakdown, CostCalculator, HardwareItem
import costing.config as cfg_c

_CONFIG_PATH = Path(__file__).parent / "data" / "config.json"


def _read_config() -> dict:
    if _CONFIG_PATH.exists():
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


# ---------- Política de tapacanto ----------
# (top, right, bottom, left) sobre el rect de la pieza tal como entra al nester.
DEFAULT_EDGING: Dict[str, Tuple[bool, bool, bool, bool]] = {
    "lateral":  (False, True,  False, False),   # canto frontal vertical
    "tapa":     (True,  False, False, False),   # canto frontal horizontal
    "base":     (True,  False, False, False),
    "estante":  (True,  False, False, False),
    "fondo":    (False, False, False, False),   # no se ve
}


def apply_edging_policy(
    pieces: List[Piece],
    policy: Optional[Dict[str, Tuple[bool, bool, bool, bool]]] = None,
) -> None:
    """Asigna `edged` in-place según nombre de pieza. Sobreescribible desde GUI."""
    policy = policy or DEFAULT_EDGING
    for p in pieces:
        if p.name in policy:
            p.edged = policy[p.name]


# ---------- Resultado del pipeline ----------
@dataclass
class ProjectResult:
    furniture: Furniture
    pieces: List[Piece]
    layout: Layout
    costo: CostBreakdown
    dxf_path: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


# ---------- Pipeline ----------
def run_pipeline_from_pieces(
    pieces: List[Piece],
    *,
    standard_sheet: Optional[Sheet] = None,
    use_inventory: bool = False,
    horas_mo: Optional[float] = None,
    herrajes: Optional[List[HardwareItem]] = None,
    dxf_path: Optional[str] = None,
    furniture: Optional[Furniture] = None,
) -> ProjectResult:
    """Variante que acepta `Piece[]` directo (para muebles importados desde DXF).

    `furniture` opcional: si se provee, se pasa al ProjectResult; si no, queda None
    (ProjectResult.furniture marca la diferencia entre "paramétrico" e "importado").
    """
    sheet = standard_sheet or Sheet(
        id="MDF18", width=STANDARD_SHEET_W, height=STANDARD_SHEET_H,
    )

    inventory = OffcutInventory()
    offcuts = inventory.available() if use_inventory else []

    cfg = _read_config()
    kerf = cfg.get("kerf_mm", cfg_nesting.KERF)

    layout = NestingOptimizer(kerf=kerf, inventory=inventory).optimize(
        pieces, standard_sheet=sheet, offcuts=offcuts,
    )

    calc = CostCalculator(
        precio_placa=cfg.get("precio_placa_mdf18", cfg_c.PRECIO_PLACA_MDF_18),
        factor_retazo=cfg.get("factor_valor_retazo", cfg_c.FACTOR_VALOR_RETAZO),
        precio_tapacanto_m=cfg.get("precio_tapacanto_m", cfg_c.PRECIO_TAPACANTO_M),
        costo_hora_cnc=cfg.get("costo_hora_cnc", cfg_c.COSTO_HORA_CNC),
        velocidad_corte=cfg.get("velocidad_corte_mm_min", cfg_c.VELOCIDAD_CORTE_MM_MIN),
        costo_hora_mo=cfg.get("costo_hora_mo", cfg_c.COSTO_HORA_MO),
        margen=cfg.get("margen", cfg_c.MARGEN),
        kerf=kerf,
    )
    costo = calc.compute(
        layout, pieces,
        horas_mo=horas_mo if horas_mo is not None else cfg.get("horas_mo_default", cfg_c.HORAS_MO_DEFAULT),
        herrajes=herrajes or [],
    )

    warnings: List[str] = []
    if layout.unplaced:
        warnings.append(
            f"{sum(p.qty for p in layout.unplaced)} pieza(s) no colocadas."
        )

    if dxf_path:
        os.makedirs(os.path.dirname(dxf_path) or ".", exist_ok=True)
        DXFExporter.export(layout, dxf_path)

    return ProjectResult(
        furniture=furniture,  # type: ignore[arg-type]
        pieces=pieces,
        layout=layout,
        costo=costo,
        dxf_path=dxf_path if dxf_path else None,
        warnings=warnings,
    )


def run_pipeline(
    furniture: Furniture,
    *,
    standard_sheet: Optional[Sheet] = None,
    use_inventory: bool = False,
    horas_mo: Optional[float] = None,
    herrajes: Optional[List[HardwareItem]] = None,
    edging_policy: Optional[Dict[str, Tuple[bool, bool, bool, bool]]] = None,
    dxf_path: Optional[str] = None,
) -> ProjectResult:
    pieces = furniture.get_pieces()
    apply_edging_policy(pieces, edging_policy)
    return run_pipeline_from_pieces(
        pieces,
        standard_sheet=standard_sheet,
        use_inventory=use_inventory,
        horas_mo=horas_mo,
        herrajes=herrajes,
        dxf_path=dxf_path,
        furniture=furniture,
    )


# ---------- CLI ----------
def _parse_herrajes(raw: Optional[str]) -> List[HardwareItem]:
    if not raw:
        return []
    items = []
    for chunk in raw.split(","):
        parts = chunk.strip().split(":")
        if len(parts) != 3:
            raise ValueError(f"Herraje mal formado: {chunk!r} (esperado nombre:qty:precio)")
        items.append(HardwareItem(parts[0], int(parts[1]), float(parts[2])))
    return items


def _build_furniture(args: argparse.Namespace) -> Furniture:
    if args.tipo == "cabinet":
        return Cabinet(
            ancho=args.ancho, alto=args.alto, profundidad=args.profundidad,
            num_estantes=args.estantes, con_fondo=not args.sin_fondo,
        )
    if args.tipo == "shelving":
        return ShelvingUnit(
            ancho=args.ancho, alto=args.alto, profundidad=args.profundidad,
            num_estantes=args.estantes,
        )
    raise ValueError(f"Tipo desconocido: {args.tipo}")


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="m_m_optimizer", description="Optimizador CNC")
    sub = p.add_subparsers(dest="tipo", required=True)

    def common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--ancho", type=float, required=True)
        sp.add_argument("--alto", type=float, required=True)
        sp.add_argument("--profundidad", type=float, required=True)
        sp.add_argument("--estantes", type=int, default=1)
        sp.add_argument("--horas-mo", type=float, default=None)
        sp.add_argument("--herrajes", type=str, default=None,
                        help='Formato "nombre:qty:precio,nombre2:qty:precio"')
        sp.add_argument("--use-inventory", action="store_true")
        sp.add_argument("--export", type=str, default=None,
                        help="Ruta del DXF de salida")

    c = sub.add_parser("cabinet", help="Mueble con tapa/base/laterales")
    common(c)
    c.add_argument("--sin-fondo", action="store_true")

    s = sub.add_parser("shelving", help="Estantería abierta")
    common(s)

    return p


def _print_report(result: ProjectResult) -> None:
    f = result.furniture
    print(f"{type(f).__name__} {f.ancho}x{f.alto}x{f.profundidad}")
    print(
        f"Piezas: {sum(p.qty for p in result.pieces)}  "
        f"|  Placas: {sum(1 for u in result.layout.sheets_used if not u.sheet.is_offcut)}"
        f"  |  Retazos consumidos: {sum(1 for u in result.layout.sheets_used if u.sheet.is_offcut)}"
        f"  |  Eficiencia: {result.layout.efficiency:.1%}"
    )
    print()
    print(result.costo.pretty())

    if result.warnings:
        print()
        for w in result.warnings:
            print(f"[!] {w}")
    if result.dxf_path:
        print(f"\nDXF: {result.dxf_path}")


def main(argv: Optional[List[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    furniture = _build_furniture(args)
    result = run_pipeline(
        furniture,
        use_inventory=args.use_inventory,
        horas_mo=args.horas_mo,
        herrajes=_parse_herrajes(args.herrajes),
        dxf_path=args.export,
    )
    _print_report(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
