"""Tests de persistencia SQLite de imported furniture."""
from __future__ import annotations

from pathlib import Path

import ezdxf
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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


@pytest.fixture(autouse=True)
def _isolate_db(monkeypatch):
    """Reemplaza engine/SessionLocal por un SQLite in-memory para cada test."""
    import backend.app.db as db_module

    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(db_module, "engine", eng)
    monkeypatch.setattr(db_module, "SessionLocal", sessionmaker(bind=eng))
    db_module.Base.metadata.create_all(eng)
    yield
    db_module.Base.metadata.drop_all(eng)


def _upload_dxf(dxf_path: str, name: str = "Mesa Test"):
    with open(dxf_path, "rb") as f:
        dxf_bytes = f.read()
    files = [("dxf_file", ("sample.dxf", dxf_bytes, "application/dxf"))]
    form = {"name": name, "material_thickness": "18.0"}
    return client.post("/api/furniture/import", data=form, files=files)


def test_create_and_get_furniture(dxf_file):
    r = _upload_dxf(dxf_file)
    assert r.status_code == 200, r.text
    body = r.json()
    furn_id = body["furniture_id"]
    assert body["created_at"] is not None

    r2 = client.get(f"/api/furniture/{furn_id}")
    assert r2.status_code == 200, r2.text
    detail = r2.json()
    assert detail["furniture_id"] == furn_id
    assert detail["name"] == "Mesa Test"
    assert detail["material_thickness"] == 18.0
    assert isinstance(detail["pieces"], list)
    assert len(detail["pieces"]) > 0
    p0 = detail["pieces"][0]
    assert "layer" in p0 and "vertices" in p0 and "width" in p0


def test_list_furniture_returns_entries(dxf_file):
    r1 = _upload_dxf(dxf_file, name="Mueble A")
    r2 = _upload_dxf(dxf_file, name="Mueble B")
    assert r1.status_code == 200 and r2.status_code == 200

    r = client.get("/api/furniture")
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    assert len(items) == 2
    names = {i["name"] for i in items}
    assert names == {"Mueble A", "Mueble B"}
    for i in items:
        assert i["thumbnail_url"].endswith("/thumbnail")
        assert isinstance(i["layers"], list)


def test_update_roles(dxf_file):
    r = _upload_dxf(dxf_file)
    assert r.status_code == 200
    furn_id = r.json()["furniture_id"]
    layers = r.json()["layers"]
    assert layers, "fixture debería tener al menos un layer"

    roles_payload = {layers[0]: "lateral"}
    r2 = client.put(
        f"/api/furniture/{furn_id}/roles",
        json={"roles": roles_payload},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"ok": True}

    r3 = client.get(f"/api/furniture/{furn_id}")
    assert r3.status_code == 200
    pieces = r3.json()["pieces"]
    updated = [p for p in pieces if p["layer"] == layers[0]]
    assert updated, "debería haber al menos una pieza en ese layer"
    assert all(p["role"] == "lateral" for p in updated)


def test_delete_furniture(dxf_file):
    r = _upload_dxf(dxf_file)
    assert r.status_code == 200
    furn_id = r.json()["furniture_id"]

    r2 = client.delete(f"/api/furniture/{furn_id}")
    assert r2.status_code == 200
    assert r2.json() == {"ok": True}

    r3 = client.get(f"/api/furniture/{furn_id}")
    assert r3.status_code == 404


def test_get_nonexistent_returns_404():
    fake = "00000000-0000-0000-0000-000000000000"
    r = client.get(f"/api/furniture/{fake}")
    assert r.status_code == 404
