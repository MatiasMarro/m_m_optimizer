import pytest

from nesting.models import Face
from parametric.cabinet import Cabinet


def test_cabinet_generates_correct_piece_count(cabinet_pieces):
    counts = {p.name: p.qty for p in cabinet_pieces}
    assert counts == {"lateral": 2, "tapa": 1, "base": 1, "estante": 2, "fondo": 1}
    assert sum(counts.values()) == 7


def test_cabinet_all_pieces_have_positive_dimensions(cabinet_pieces):
    for p in cabinet_pieces:
        assert p.width > 0
        assert p.height > 0
        assert p.qty > 0


def test_cabinet_only_laterales_are_grain_locked(cabinet_pieces):
    for p in cabinet_pieces:
        if p.name == "lateral":
            assert p.grain_locked is True
        else:
            assert p.grain_locked is False


def test_cabinet_with_zero_estantes_produces_no_estante_piece():
    cab = Cabinet(ancho=600, alto=720, profundidad=400, num_estantes=0)
    names = {p.name for p in cab.get_pieces()}
    assert "estante" not in names


def test_shelving_generates_laterales_and_estantes(shelving_800):
    pieces = shelving_800.get_pieces()
    counts = {p.name: p.qty for p in pieces}
    assert counts == {"lateral": 2, "estante": 3}


def test_cabinet_raises_when_ancho_not_larger_than_twice_thickness():
    with pytest.raises(ValueError):
        Cabinet(ancho=30, alto=720, profundidad=400)


def test_cabinet_lateral_holes_are_on_face_up(cabinet_pieces):
    lateral = next(p for p in cabinet_pieces if p.name == "lateral")
    assert len(lateral.holes) > 0
    assert all(h.face == Face.FACE_UP for h in lateral.holes)


def test_cabinet_tapa_and_base_holes_are_on_edges(cabinet_pieces):
    edge_faces = {Face.EDGE_LEFT, Face.EDGE_RIGHT, Face.EDGE_TOP, Face.EDGE_BOTTOM}
    for name in ("tapa", "base"):
        piece = next(p for p in cabinet_pieces if p.name == name)
        assert len(piece.holes) > 0
        assert all(h.face in edge_faces for h in piece.holes)
