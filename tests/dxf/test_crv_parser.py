"""Tests del parser de .crv3d (formato nativo de Vectric Aspire)."""
from __future__ import annotations

import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.server import app
from backend.app.dxf import crv_parser
from backend.app.routers import furniture_import as fi_mod

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
CRV3D_FIXTURE = FIXTURE_DIR / "aspire_sample.crv3d"

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_furniture_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(fi_mod, "FURNITURE_DIR", tmp_path / "furniture")


# ─── Unit tests de helpers (no dependen del fixture) ───────────────────────────

def test_extract_utf16_pascal_strings_decodes_ascii():
    payload = b"\xff\xfe\xff\x05" + "Hello".encode("utf-16-le")
    assert crv_parser._extract_utf16_pascal_strings(payload) == ["Hello"]


def test_extract_utf16_pascal_strings_dedupes_in_order():
    s = b"\xff\xfe\xff\x03" + "ABC".encode("utf-16-le")
    payload = b"\x00" + s + b"\x00" + s + b"\xff\xfe\xff\x03" + "DEF".encode("utf-16-le")
    assert crv_parser._extract_utf16_pascal_strings(payload) == ["ABC", "DEF"]


def test_extract_utf16_pascal_strings_skips_unreasonable_lengths():
    # length byte 0xff = 255 chars → 510 bytes que no existen en el buffer
    payload = b"\xff\xfe\xff\xff" + b"AB" * 5
    assert crv_parser._extract_utf16_pascal_strings(payload) == []


def test_decode_material_size_extracts_negative_thickness():
    data = b"\x00" * 16
    data += struct.pack("<d", -18.5)
    data += struct.pack("<d", 1830.0)
    data += struct.pack("<d", 2440.0)
    w, h, t = crv_parser._decode_material_size(data)
    assert w == 1830.0
    assert h == 2440.0
    assert t == 18.5


def test_decode_material_size_returns_none_on_garbage():
    w, h, t = crv_parser._decode_material_size(b"\x00" * 8)
    assert (w, h, t) == (None, None, None)


def test_filter_layer_names_strips_internals_and_prefixes():
    names = crv_parser._filter_layer_names([
        "Toolpath Previews",  # interno
        "Defpoints",  # interno
        "vcCadLayer",  # nombre de clase
        "utParameter",  # nombre de clase
        "CONTORNO",  # capa real
        "Drill_8mm",  # capa real
    ])
    assert names == ["CONTORNO", "Drill_8mm"]


def test_is_crv3d_file_rejects_non_ole(tmp_path):
    p = tmp_path / "fake.crv3d"
    p.write_bytes(b"not an OLE file")
    assert crv_parser.is_crv3d_file(str(p)) is False


def test_is_crv3d_file_rejects_missing_path(tmp_path):
    assert crv_parser.is_crv3d_file(str(tmp_path / "missing.crv3d")) is False


def test_is_crv3d_file_accepts_ole_magic(tmp_path):
    p = tmp_path / "fake.crv3d"
    p.write_bytes(crv_parser.CRV3D_OLE_MAGIC + b"\x00" * 100)
    assert crv_parser.is_crv3d_file(str(p)) is True


def test_parse_aspire_crv3d_metadata_rejects_non_ole(tmp_path):
    p = tmp_path / "bad.crv3d"
    p.write_bytes(b"hello")
    with pytest.raises(ValueError, match="OLE2"):
        crv_parser.parse_aspire_crv3d_metadata(str(p))


# ─── Integration tests con fixture real (skip si no está) ──────────────────────

requires_fixture = pytest.mark.skipif(
    not CRV3D_FIXTURE.exists(),
    reason="aspire_sample.crv3d no disponible en tests/fixtures/",
)


@requires_fixture
def test_metadata_extraction_from_real_sample():
    meta = crv_parser.parse_aspire_crv3d_metadata(str(CRV3D_FIXTURE))
    assert meta.aspire_version and "Aspire" in meta.aspire_version
    assert meta.material_thickness_mm and 1 < meta.material_thickness_mm < 100
    assert meta.material_width_mm and meta.material_width_mm > 100
    assert meta.material_height_mm and meta.material_height_mm > 100
    assert meta.has_preview_gif is True
    assert "VectorData/2dDataV2" in meta.streams
    assert any("CONTORNO" in n or n != "" for n in meta.layer_names)


@requires_fixture
def test_parse_aspire_crv3d_raises_export_required():
    with pytest.raises(crv_parser.Crv3dExportRequiredError) as ei:
        crv_parser.parse_aspire_crv3d(str(CRV3D_FIXTURE), 18.0)
    assert ei.value.metadata.has_preview_gif


@requires_fixture
def test_extract_preview_gif_returns_valid_gif_header():
    gif = crv_parser.extract_preview_gif(str(CRV3D_FIXTURE))
    assert gif is not None and gif.startswith(b"GIF8")


@requires_fixture
def test_import_crv3d_returns_422_with_metadata():
    with open(CRV3D_FIXTURE, "rb") as f:
        body = f.read()
    files = [("dxf_file", ("muestra.crv3d", body, "application/octet-stream"))]
    r = client.post(
        "/api/furniture/import",
        data={"name": "Mueble Aspire", "material_thickness": "18.0"},
        files=files,
    )
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["code"] == "crv3d_not_supported"
    assert "DXF" in detail["message"]
    assert detail["metadata"]["aspire_version"]
    assert detail["metadata"]["material_thickness_mm"]
    # GIF preview embebido viaja en base64 para que el frontend lo muestre
    import base64 as _b64
    assert detail["preview_gif_base64"]
    assert _b64.b64decode(detail["preview_gif_base64"])[:4] == b"GIF8"


def test_import_unknown_extension_still_400():
    files = [("dxf_file", ("file.png", b"\x89PNG\r\n", "image/png"))]
    r = client.post(
        "/api/furniture/import",
        data={"name": "X", "material_thickness": "18.0"},
        files=files,
    )
    assert r.status_code == 400
    assert ".dxf" in r.json()["detail"] and ".crv3d" in r.json()["detail"]


def test_import_crv3d_extension_but_invalid_content_returns_400(tmp_path):
    # Archivo con extensión .crv3d pero contenido no-OLE2 → fallo claro
    files = [("dxf_file", ("fake.crv3d", b"not an OLE file at all", "application/octet-stream"))]
    r = client.post(
        "/api/furniture/import",
        data={"name": "X", "material_thickness": "18.0"},
        files=files,
    )
    assert r.status_code == 400
    assert "crv3d" in r.json()["detail"].lower() or "OLE" in r.json()["detail"]


@requires_fixture
def test_crv3d_response_does_not_persist_anything(tmp_path):
    # Tras un .crv3d rechazado no debe quedar furniture_dir colgado
    with open(CRV3D_FIXTURE, "rb") as f:
        body = f.read()
    files = [("dxf_file", ("muestra.crv3d", body, "application/octet-stream"))]
    r = client.post(
        "/api/furniture/import",
        data={"name": "Mueble", "material_thickness": "18.0"},
        files=files,
    )
    assert r.status_code == 422
    # FURNITURE_DIR está monkeypatch-ed al tmp; no debería contener subdirs
    fdir = fi_mod.FURNITURE_DIR
    if fdir.exists():
        assert not any(fdir.iterdir()), "furniture_dir quedó con archivos huérfanos tras .crv3d rechazado"


@requires_fixture
def test_crv3d_then_dxf_in_same_session(tmp_path):
    # Subir un .crv3d y luego un .dxf no debe ensuciar el estado del segundo
    with open(CRV3D_FIXTURE, "rb") as f:
        crv_body = f.read()
    r1 = client.post(
        "/api/furniture/import",
        data={"name": "X", "material_thickness": "18.0"},
        files=[("dxf_file", ("a.crv3d", crv_body, "application/octet-stream"))],
    )
    assert r1.status_code == 422

    # Ahora subir el DXF de fixture estándar
    dxf_path = FIXTURE_DIR / "aspire_sample.dxf"
    if not dxf_path.exists():
        pytest.skip("aspire_sample.dxf no disponible")
    with open(dxf_path, "rb") as f:
        dxf_body = f.read()
    r2 = client.post(
        "/api/furniture/import",
        data={"name": "Mesa", "material_thickness": "18.0"},
        files=[("dxf_file", ("b.dxf", dxf_body, "application/dxf"))],
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["contours_count"] > 0
