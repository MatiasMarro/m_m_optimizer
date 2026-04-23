import pytest

from costing.calculator import CostCalculator
from costing.models import HardwareItem


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
