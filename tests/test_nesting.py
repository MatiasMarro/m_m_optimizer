from nesting.models import Piece, Sheet
from nesting.optimizer import NestingOptimizer


def test_cabinet_pieces_are_all_placed(cabinet_layout):
    assert len(cabinet_layout.unplaced) == 0


def test_cabinet_layout_efficiency_above_floor(cabinet_layout):
    # Cabinet 600×720×400 sobre placa 1830×2440: ~0.42 empírico.
    # Umbral conservador que distingue "optimizer funcionando" de "piezas amontonadas".
    assert cabinet_layout.efficiency > 0.4


def test_cabinet_layout_uses_at_least_one_sheet(cabinet_layout):
    assert len(cabinet_layout.sheets_used) >= 1


def test_grain_locked_pieces_are_not_rotated(cabinet_layout, cabinet_pieces):
    locked_names = {p.name for p in cabinet_pieces if p.grain_locked}
    for usage in cabinet_layout.sheets_used:
        for placement in usage.placements:
            if placement.piece_name in locked_names:
                assert placement.rotated is False


def test_new_offcuts_meet_minimum_side(cabinet_layout):
    for oc in cabinet_layout.new_offcuts:
        assert oc.width >= 200
        assert oc.height >= 200


def test_piece_larger_than_sheet_goes_to_unplaced():
    tiny_sheet = Sheet(id="TINY", width=100, height=100)
    big_piece = Piece(name="big", width=500, height=500, qty=1)
    layout = NestingOptimizer().optimize([big_piece], tiny_sheet, offcuts=[])
    unplaced_qty = sum(p.qty for p in layout.unplaced if p.name == "big")
    assert unplaced_qty == 1
