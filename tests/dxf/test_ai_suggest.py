"""Tests del endpoint POST /api/furniture/{id}/suggest-roles + helpers de IA.

Sin API key: los tests de integración con Claude se skipean. Los unitarios
del agregador `_aggregate_layers_for_ai` corren siempre.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import ezdxf
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.server import app
from backend.app.ai import LayerInfo
from backend.app.routers import furniture_import as fi_mod
from backend.app.routers.furniture_import import _aggregate_layers_for_ai

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
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(str(path))


@pytest.fixture
def dxf_file() -> str:
    if not FIXTURE_PATH.exists():
        _build_minimal_fixture(FIXTURE_PATH)
    return str(FIXTURE_PATH)


@pytest.fixture(autouse=True)
def _isolate_furniture_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(fi_mod, "FURNITURE_DIR", tmp_path / "furniture")


@pytest.fixture(autouse=True)
def _isolate_db(monkeypatch):
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


def _upload(dxf_path: str):
    with open(dxf_path, "rb") as f:
        body = f.read()
    return client.post(
        "/api/furniture/import",
        data={"name": "Mesa Test", "material_thickness": "18.0"},
        files=[("dxf_file", ("sample.dxf", body, "application/dxf"))],
    )


# ─── Unit tests del agregador ────────────────────────────────────────────────

def test_aggregate_layers_groups_by_layer():
    parsed = {
        "contours": [
            {"layer": "A", "op_type": "profile", "width": 100, "height": 200, "depth": 18},
            {"layer": "A", "op_type": "profile", "width": 102, "height": 200, "depth": 18},
            {"layer": "B", "op_type": "drill", "width": 8, "height": 8, "depth": 0},
        ]
    }
    layers = _aggregate_layers_for_ai(parsed)
    by_name = {l.name: l for l in layers}
    assert set(by_name) == {"A", "B"}
    assert by_name["A"].count == 2
    assert by_name["A"].op_type_distribution == {"profile": 2}
    assert by_name["A"].avg_width == 101.0
    assert by_name["B"].op_type_distribution == {"drill": 1}


def test_aggregate_layers_skips_invalid():
    parsed = {"contours": [{"layer": None}, {"foo": "bar"}, "garbage"]}
    assert _aggregate_layers_for_ai(parsed) == []


# ─── Endpoint sin API key → 422 con mensaje claro ────────────────────────────

def test_suggest_roles_missing_api_key_returns_422(dxf_file, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # También aislamos el config.json del proyecto real
    monkeypatch.setattr(fi_mod, "DATA_DIR", Path("/tmp/no-such-dir-claude-test"))

    r = _upload(dxf_file)
    assert r.status_code == 200, r.text
    furn_id = r.json()["furniture_id"]

    r2 = client.post(f"/api/furniture/{furn_id}/suggest-roles")
    assert r2.status_code == 422
    assert "ANTHROPIC_API_KEY" in r2.json()["detail"]


def test_suggest_roles_404_on_missing():
    fake = "00000000-0000-0000-0000-000000000000"
    r = client.post(f"/api/furniture/{fake}/suggest-roles")
    assert r.status_code == 404


# ─── Endpoint con API key mockeada ────────────────────────────────────────────

def test_suggest_roles_returns_suggestions_when_mocked(dxf_file, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-fake")
    r = _upload(dxf_file)
    furn_id = r.json()["furniture_id"]

    fake_suggestions = {"Profile": "lateral", "Drill_8mm": "skip"}

    def fake_suggest(furniture_name, material_thickness, layers, **kwargs):
        assert isinstance(layers, list)
        assert all(isinstance(l, LayerInfo) for l in layers)
        return fake_suggestions

    with patch("backend.app.routers.furniture_import.ai_suggest_roles", side_effect=fake_suggest):
        r2 = client.post(f"/api/furniture/{furn_id}/suggest-roles")

    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["model"] == "claude-opus-4-7"
    assert body["layers_analyzed"] >= 1
    assert body["suggestions"]["Profile"] == "lateral"


def test_suggest_roles_502_on_api_error(dxf_file, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-fake")
    r = _upload(dxf_file)
    furn_id = r.json()["furniture_id"]

    def boom(*args, **kwargs):
        raise RuntimeError("simulated network error")

    with patch("backend.app.routers.furniture_import.ai_suggest_roles", side_effect=boom):
        r2 = client.post(f"/api/furniture/{furn_id}/suggest-roles")

    assert r2.status_code == 502
    assert "Claude" in r2.json()["detail"]


# ─── /config/ai endpoints ─────────────────────────────────────────────────────

def test_ai_config_get_no_key(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import api.server as server_mod
    monkeypatch.setattr(server_mod, "CONFIG_PATH", tmp_path / "config.json")

    r = client.get("/config/ai")
    assert r.status_code == 200
    body = r.json()
    assert body["has_anthropic_api_key"] is False
    assert body["masked_key"] is None
    assert body["model"] == "claude-opus-4-7"


def test_ai_config_set_and_mask(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import api.server as server_mod
    monkeypatch.setattr(server_mod, "CONFIG_PATH", tmp_path / "config.json")

    full_key = "sk-ant-api03-abcdefghijklmnopqrstuv0123456789XYZW"
    r = client.put("/config/ai", json={"anthropic_api_key": full_key})
    assert r.status_code == 200
    body = r.json()
    assert body["has_anthropic_api_key"] is True
    assert body["masked_key"] is not None
    assert body["masked_key"].startswith("sk-ant-")
    assert body["masked_key"].endswith("XYZW")
    assert full_key not in body["masked_key"]  # no leak


def test_ai_config_clear(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import api.server as server_mod
    cfg_path = tmp_path / "config.json"
    monkeypatch.setattr(server_mod, "CONFIG_PATH", cfg_path)

    # Set then clear
    client.put("/config/ai", json={"anthropic_api_key": "sk-ant-fakekey1234567890ABCD"})
    r = client.put("/config/ai", json={"anthropic_api_key": None})
    assert r.status_code == 200
    assert r.json()["has_anthropic_api_key"] is False


def test_ai_config_falls_back_to_env(monkeypatch, tmp_path):
    """Si no hay key en config.json pero sí en env, GET reporta has_key=True."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env-fakekey1234567890ABCD")
    import api.server as server_mod
    monkeypatch.setattr(server_mod, "CONFIG_PATH", tmp_path / "config.json")

    r = client.get("/config/ai")
    assert r.status_code == 200
    body = r.json()
    assert body["has_anthropic_api_key"] is True
    assert body["masked_key"].endswith("ABCD")


def test_costing_config_put_preserves_anthropic_key(monkeypatch, tmp_path):
    """PUT /config/costing no debe pisar anthropic_api_key existente."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import api.server as server_mod
    cfg_path = tmp_path / "config.json"
    monkeypatch.setattr(server_mod, "CONFIG_PATH", cfg_path)

    # 1. Set AI key
    client.put("/config/ai", json={"anthropic_api_key": "sk-ant-preserveTest1234567"})
    # 2. Update costing
    cfg = {
        "precio_placa_mdf18": 50000.0,
        "factor_valor_retazo": 0.5,
        "precio_tapacanto_m": 800.0,
        "costo_hora_cnc": 8000.0,
        "velocidad_corte_mm_min": 3000.0,
        "costo_hora_mo": 3500.0,
        "horas_mo_default": 4.0,
        "margen": 0.40,
        "kerf_mm": 3.0,
    }
    r = client.put("/config/costing", json=cfg)
    assert r.status_code == 200
    # 3. AI key debe seguir presente
    r2 = client.get("/config/ai")
    assert r2.json()["has_anthropic_api_key"] is True
