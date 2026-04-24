import pytest

from costing.calculator import CostCalculator
from costing.models import HardwareItem
from nesting.models import Layout, Piece, PlacedPiece, Sheet, SheetUsage


def test_cabinet_cost_total_is_positive(cabinet_layout, cabinet_pieces):
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces)
    assert costo.total > 0


def test_cost_total_equals_subtotal_plus_margen(cabinet_layout, cabinet_pieces):
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces)
    assert costo.total == pytest.approx(costo.subtotal + costo.margen)


def test_cost_subtotal_sums_all_rubros(cabinet_layout, cabinet_pieces):
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces)
    expected = (
        costo.material_placas + costo.material_retazos
        + costo.tapacanto + costo.tiempo_cnc
        + costo.mano_obra + costo.herrajes
    )
    assert costo.subtotal == pytest.approx(expected)


def test_material_placas_positive_when_new_sheet_used(cabinet_layout, cabinet_pieces):
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces)
    assert any(not u.sheet.is_offcut for u in cabinet_layout.sheets_used)
    assert costo.material_placas > 0


def test_metros_tapacanto_positive_when_any_piece_has_edged(cabinet_layout, cabinet_pieces):
    for p in cabinet_pieces:
        if p.name == "lateral":
            p.edged = (False, True, False, False)
            break
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces)
    assert costo.metros_tapacanto > 0
    assert costo.tapacanto > 0


def test_margen_is_forty_percent_of_subtotal(cabinet_layout, cabinet_pieces):
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces)
    assert costo.margen == pytest.approx(costo.subtotal * 0.40, abs=1e-6)


def test_hardware_cost_matches_item_totals(cabinet_layout, cabinet_pieces):
    herrajes = [HardwareItem("bisagra", 4, 1200)]
    costo = CostCalculator().compute(cabinet_layout, cabinet_pieces, herrajes=herrajes)
    assert costo.herrajes == 4800


# ---------- deduplicación de cortes compartidos ----------

def _make_layout_two_pieces(kerf: float, adjacent: bool) -> Layout:
    """Dos piezas 400×300 en la misma placa.
    Si adjacent=True, la pieza B se coloca con gap exacto = kerf (comparten un corte).
    Si adjacent=False, se coloca con gap > kerf (sin corte compartido).
    """
    sheet = Sheet(id="TEST", width=1830, height=2440)
    w, h = 400.0, 300.0
    gap = kerf if adjacent else kerf + 100.0
    pl_a = PlacedPiece(piece_name="A", sheet_id="TEST", x=0, y=0, width=w, height=h)
    pl_b = PlacedPiece(piece_name="B", sheet_id="TEST", x=w + gap, y=0, width=w, height=h)
    usage = SheetUsage(sheet=sheet, placements=[pl_a, pl_b])
    return Layout(sheets_used=[usage], unplaced=[], efficiency=1.0, new_offcuts=[])


def test_adjacent_pieces_less_cnc_than_isolated(cabinet_pieces):
    kerf = 3.0
    calc = CostCalculator(kerf=kerf)
    pieces = [Piece(name="A", width=400, height=300), Piece(name="B", width=400, height=300)]

    layout_adj = _make_layout_two_pieces(kerf, adjacent=True)
    layout_iso = _make_layout_two_pieces(kerf, adjacent=False)

    costo_adj = calc.compute(layout_adj, pieces)
    costo_iso = calc.compute(layout_iso, pieces)

    assert costo_adj.minutos_cnc < costo_iso.minutos_cnc


def test_adjacent_pieces_shared_cut_deducted_once(cabinet_pieces):
    kerf = 3.0
    calc = CostCalculator(kerf=kerf)
    pieces = [Piece(name="A", width=400, height=300), Piece(name="B", width=400, height=300)]

    layout = _make_layout_two_pieces(kerf, adjacent=True)
    costo = calc.compute(layout, pieces)

    # Perimetro sin deduplicar: 2*(400+300)*2 = 2800 mm
    # Corte compartido: 300 mm (altura compartida)
    # Esperado: 2800 - 300 = 2500 mm
    velocidad = calc.velocidad_corte
    minutos_esperados = 2500.0 / velocidad
    assert costo.minutos_cnc == pytest.approx(minutos_esperados, abs=1e-6)
