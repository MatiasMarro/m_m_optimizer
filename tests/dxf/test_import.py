"""Tests del endpoint /api/furniture/import."""
from __future__ import annotations

import io
from pathlib import Path

import ezdxf
import pytest
from fastapi.testclient import TestClient

from api.server import app
from backend.app.routers import furniture_import as fi_mod

client = TestClient(app)

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
FIXTURE_PATH = FIXTURE_DIR / "aspire_sample.dxf"


def _build_minimal_fixture(path: Path) -> None:
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [(0, 0), (600, 0), (600, 400), (0, 400)],
        close=True,
        dxfattribs={"layer": "Profile", "elevation": 18},
    )
    msp.add_circle(center=(50, 50, 0), radius=4, dxfattribs={"layer": "Drill_8mm"})
    msp.add_lwpolyline(
        [(100, 100), (300, 100), (300, 200), (100, 200)],
        close=True,
        dxfattribs={"layer": "Pocket_cajeo", "elevation": -8},
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(str(path))


@pytest.fixture
def dxf_file() -> str:
    if not FIXTURE_PATH.exists():
        _build_minimal_fixture(FIXTURE_PATH)
    return str(FIXTURE_PATH)


@pytest.fixture(autouse=True)
def _isolate_furniture_dir(tmp_path, monkeypatch):
    """Redirige FURNITURE_DIR a tmp para no contaminar data/furniture/ real."""
    monkeypatch.setattr(fi_mod, "FURNITURE_DIR", tmp_path / "furniture")


def _upload_dxf(dxf_path: str, extra_files: list | None = None, **data):
    with open(dxf_path, "rb") as f:
        dxf_bytes = f.read()
    files = [("dxf_file", ("sample.dxf", dxf_bytes, "application/dxf"))]
    if extra_files:
        files.extend(extra_files)
    form = {"name": "Mesa Test", "material_thickness": "18.0"}
    form.update({k: str(v) for k, v in data.items()})
    return client.post("/api/furniture/import", data=form, files=files)


def test_import_dxf_only(dxf_file):
    r = _upload_dxf(dxf_file)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "furniture_id" in body and body["furniture_id"]
    assert body["name"] == "Mesa Test"
    assert body["contours_count"] > 0
    assert body["dxf_filename"] == "original.dxf"
    assert body["thumbnail_url"].endswith("/thumbnail")


def test_import_returns_layers(dxf_file):
    r = _upload_dxf(dxf_file)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["layers"], list)
    assert len(body["layers"]) > 0


def test_thumbnail_endpoint(dxf_file):
    r = _upload_dxf(dxf_file)
    assert r.status_code == 200
    furn_id = r.json()["furniture_id"]

    r2 = client.get(f"/api/furniture/{furn_id}/thumbnail")
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "image/jpeg"
    assert len(r2.content) > 0


def test_no_dxf_returns_422():
    r = client.post(
        "/api/furniture/import",
        data={"name": "Mesa", "material_thickness": "18.0"},
    )
    assert r.status_code == 422


def test_bad_extension():
    files = [("dxf_file", ("not_a_dxf.txt", b"hello world", "text/plain"))]
    r = client.post(
        "/api/furniture/import",
        data={"name": "Mesa", "material_thickness": "18.0"},
        files=files,
    )
    assert r.status_code == 400


def test_bad_image_format_is_warning(dxf_file):
    extra = [("reference_images", ("badimg.bmp", b"BMFAKE", "image/bmp"))]
    r = _upload_dxf(dxf_file, extra_files=extra)
    assert r.status_code == 200
    body = r.json()
    assert body["uploaded_images_count"] == 0
    assert any("no soportada" in w for w in body["warnings"])


def test_material_thickness_out_of_range(dxf_file):
    r = _upload_dxf(dxf_file, material_thickness=5.0)
    assert r.status_code == 422


def test_import_with_valid_image(dxf_file):
    PIL = pytest.importorskip("PIL.Image")
    buf = io.BytesIO()
    img = PIL.new("RGB", (32, 32), color=(200, 100, 50))
    img.save(buf, format="JPEG")
    buf.seek(0)
    extra = [("reference_images", ("ref.jpg", buf.getvalue(), "image/jpeg"))]
    r = _upload_dxf(dxf_file, extra_files=extra)
    assert r.status_code == 200
    body = r.json()
    assert body["uploaded_images_count"] == 1


def test_thumbnail_invalid_uuid_returns_400():
    r = client.get("/api/furniture/not-a-uuid/thumbnail")
    assert r.status_code == 400
