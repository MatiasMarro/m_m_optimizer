"""Tests del parser DXF de Aspire."""
from __future__ import annotations

import os
from pathlib import Path

import ezdxf
import pytest

from backend.app.dxf.parser import (
    OperationType,
    ParsedContour,
    ParseResult,
    classify_entity,
    classify_layer,
    compute_bbox,
    entity_to_vertices,
    extract_tool_diameter,
    parse_aspire_dxf,
)


FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
FIXTURE_PATH = FIXTURE_DIR / "aspire_sample.dxf"


def _build_aspire_sample(path: Path) -> None:
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    msp.add_lwpolyline(
        [(0, 0), (600, 0), (600, 400), (0, 400)],
        close=True,
        dxfattribs={"layer": "Profile", "elevation": 18},
    )

    for x, y in [(100, 100), (500, 100), (100, 300), (500, 300)]:
        msp.add_circle(center=(x, y, -12), radius=4, dxfattribs={"layer": "Drill_8mm"})

    msp.add_lwpolyline(
        [(150, 150), (450, 150), (450, 350), (150, 350)],
        close=True,
        dxfattribs={"layer": "Pocket_cajeo", "elevation": -8},
    )

    msp.add_line(start=(50, 50, 0), end=(550, 50, 0), dxfattribs={"layer": "ref_marcas"})
    msp.add_circle(center=(75, 75, 0), radius=2, dxfattribs={"layer": "ref_marcas"})

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(str(path))


@pytest.fixture(scope="module")
def aspire_fixture() -> str:
    if not FIXTURE_PATH.exists():
        _build_aspire_sample(FIXTURE_PATH)
    return str(FIXTURE_PATH)


@pytest.fixture(scope="module")
def parsed(aspire_fixture: str) -> ParseResult:
    return parse_aspire_dxf(aspire_fixture, material_thickness=18.0)


class TestExtractToolDiameter:
    @pytest.mark.parametrize("name, expected", [
        ("Drill_6mm", 6.0),
        ("Drill_10.5mm", 10.5),
        ("_D8", 8.0),
        ("_D10", 10.0),
        ("dia6", 6.0),
        ("diam8", 8.0),
        ("fresa6", 6.0),
        ("fresa_6", 6.0),
        ("Fresa 8", 8.0),
    ])
    def test_matching_patterns(self, name: str, expected: float) -> None:
        assert extract_tool_diameter(name) == expected

    @pytest.mark.parametrize("name", ["Profile", "random_layer", "Pocket"])
    def test_no_match_returns_none(self, name: str) -> None:
        assert extract_tool_diameter(name) is None


class TestClassifyLayer:
    @pytest.mark.parametrize("name, expected", [
        ("Drill", OperationType.DRILL),
        ("drill_8mm", OperationType.DRILL),
        ("Hole", OperationType.DRILL),
        ("tarugo", OperationType.DRILL),
        ("Pocket", OperationType.POCKET),
        ("cajeo", OperationType.POCKET),
        ("Groove", OperationType.POCKET),
        ("Reference", OperationType.REFERENCE),
        ("ref_marcas", OperationType.REFERENCE),
        ("Profile", OperationType.PROFILE),
        ("contorno", OperationType.PROFILE),
        ("outline", OperationType.PROFILE),
    ])
    def test_keyword_matching(self, name: str, expected: OperationType) -> None:
        assert classify_layer(name) == expected

    def test_normalization_spaces_and_dashes(self) -> None:
        assert classify_layer("  Drill 8mm ") == OperationType.DRILL
        assert classify_layer("Drill-8mm") == OperationType.DRILL

    def test_no_match_returns_none(self) -> None:
        assert classify_layer("Unknown_Layer_123") is None
        assert classify_layer("xyz") is None


class TestComputeBbox:
    def test_simple_rectangle(self) -> None:
        assert compute_bbox([(0, 0), (100, 0), (100, 50), (0, 50)]) == (0, 0, 100, 50)

    def test_negative_coordinates(self) -> None:
        assert compute_bbox([(-10, -20), (10, 20)]) == (-10, -20, 10, 20)

    def test_single_point(self) -> None:
        assert compute_bbox([(5, 7)]) == (5, 7, 5, 7)

    def test_empty_raises(self) -> None:
        with pytest.raises(ValueError):
            compute_bbox([])


class TestParseAspireDxf:
    def test_parse_returns_all_layers(self, parsed: ParseResult) -> None:
        assert set(parsed.layer_summary.keys()) >= {
            "Profile", "Drill_8mm", "Pocket_cajeo", "ref_marcas",
        }

    def test_profile_classified_correctly(self, parsed: ParseResult) -> None:
        profile_contours = [c for c in parsed.contours if c.layer == "Profile"]
        assert profile_contours
        assert all(c.op_type == OperationType.PROFILE for c in profile_contours)

    def test_drill_classified_correctly(self, parsed: ParseResult) -> None:
        drills = [c for c in parsed.contours if c.layer == "Drill_8mm"]
        assert len(drills) == 4
        assert all(c.op_type == OperationType.DRILL for c in drills)

    def test_drill_diameter_from_layer(self, parsed: ParseResult) -> None:
        drills = [c for c in parsed.contours if c.layer == "Drill_8mm"]
        assert drills
        assert all(c.tool_diameter == 8.0 for c in drills)

    def test_pocket_classified_correctly(self, parsed: ParseResult) -> None:
        pockets = [c for c in parsed.contours if c.layer == "Pocket_cajeo"]
        assert pockets
        assert all(c.op_type == OperationType.POCKET for c in pockets)
        assert all(c.depth == pytest.approx(8.0) for c in pockets)
        assert all(c.is_through_cut is False for c in pockets)

    def test_reference_layer(self, parsed: ParseResult) -> None:
        refs = [c for c in parsed.contours if c.layer == "ref_marcas"]
        assert refs
        for c in refs:
            assert c.op_type == OperationType.REFERENCE

    def test_profile_bbox_dimensions(self, parsed: ParseResult) -> None:
        profile = next(c for c in parsed.contours if c.layer == "Profile")
        assert profile.width == pytest.approx(600, abs=1)
        assert profile.height == pytest.approx(400, abs=1)

    def test_profile_is_through_cut(self, parsed: ParseResult) -> None:
        profile = next(c for c in parsed.contours if c.layer == "Profile")
        assert profile.is_through_cut is True
        assert profile.depth == pytest.approx(18.0)

    def test_result_is_parse_result(self, parsed: ParseResult) -> None:
        assert isinstance(parsed, ParseResult)
        assert all(isinstance(c, ParsedContour) for c in parsed.contours)

    def test_invalid_file_raises(self) -> None:
        with pytest.raises((FileNotFoundError, IOError)):
            parse_aspire_dxf("/nonexistent/path/does-not-exist.dxf")


class TestDetectQualityIssues:
    def test_oversized_piece_warning(self, tmp_path) -> None:
        """Una pieza más grande que la placa estándar dispara warning."""
        from backend.app.dxf.parser import detect_quality_issues
        path = tmp_path / "oversized.dxf"
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        # 3000x3000mm — más grande que 1830x2440 en ambas orientaciones
        msp.add_lwpolyline(
            [(0, 0), (3000, 0), (3000, 3000), (0, 3000)],
            close=True,
            dxfattribs={"layer": "BIG", "elevation": 18},
        )
        doc.saveas(str(path))

        result = parse_aspire_dxf(str(path))
        assert any("excede" in w for w in result.warnings)

    def test_duplicate_profile_warning(self, tmp_path) -> None:
        """Dos contornos PROFILE superpuestos en el mismo layer → warning."""
        path = tmp_path / "dup.dxf"
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        for _ in range(2):
            msp.add_lwpolyline(
                [(0, 0), (500, 0), (500, 300), (0, 300)],
                close=True,
                dxfattribs={"layer": "DUP", "elevation": 18},
            )
        doc.saveas(str(path))

        result = parse_aspire_dxf(str(path))
        assert any("superpuestos" in w or "duplicado" in w for w in result.warnings)

    def test_layer_without_profile_warning(self, parsed: ParseResult) -> None:
        """Layers como Drill_8mm o ref_marcas no tienen PROFILE → warning informativo."""
        assert any("sin contornos PROFILE" in w for w in parsed.warnings)


class TestTextAnnotations:
    def test_extract_text_entity(self, tmp_path) -> None:
        path = tmp_path / "with_text.dxf"
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        msp.add_text(
            "600 mm",
            dxfattribs={"layer": "COTAS", "height": 10, "insert": (100, 200)},
        )
        msp.add_lwpolyline(
            [(0, 0), (600, 0), (600, 400), (0, 400)],
            close=True,
            dxfattribs={"layer": "Profile", "elevation": 18},
        )
        doc.saveas(str(path))

        result = parse_aspire_dxf(str(path))
        assert len(result.text_annotations) >= 1
        ann = result.text_annotations[0]
        assert ann.text == "600 mm"
        assert ann.layer == "COTAS"
        assert ann.kind == "text"
        assert ann.x == pytest.approx(100, abs=1)
        assert ann.y == pytest.approx(200, abs=1)
        # Y los TEXT/MTEXT/DIMENSION ya NO deben aparecer en unrecognized_entities
        assert "TEXT" not in result.unrecognized_entities

    def test_text_annotations_serializable(self, tmp_path) -> None:
        """parsed_data persistido en DB debe poder serializarse a JSON."""
        from backend.app.routers.furniture_import import _serialize_parsed
        import json as _json

        path = tmp_path / "serializable.dxf"
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        msp.add_text("test", dxfattribs={"layer": "X", "height": 5, "insert": (0, 0)})
        msp.add_lwpolyline(
            [(0, 0), (100, 0), (100, 100), (0, 100)],
            close=True,
            dxfattribs={"layer": "P", "elevation": 18},
        )
        doc.saveas(str(path))

        result = parse_aspire_dxf(str(path))
        payload = _serialize_parsed(result)
        # No debe lanzar
        roundtrip = _json.loads(_json.dumps(payload))
        assert "text_annotations" in roundtrip
        assert len(roundtrip["text_annotations"]) >= 1
        assert roundtrip["text_annotations"][0]["text"] == "test"
