"""SQLAlchemy setup para imported furniture (DXF importados).

Usa SQLite en data/furniture.db. `init_db()` es idempotente (create_all).
"""
from __future__ import annotations

import datetime
import os
from pathlib import Path

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Respeta MM_DATA_DIR (modo .exe / PyInstaller). Fallback: data/ relativo a la raíz del repo.
DATA_DIR = (
    Path(os.environ["MM_DATA_DIR"])
    if "MM_DATA_DIR" in os.environ
    else Path(__file__).resolve().parents[2] / "data"
)

engine = create_engine(
    f"sqlite:///{DATA_DIR}/furniture.db",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class ImportedFurniture(Base):
    __tablename__ = "imported_furniture"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    dxf_path = Column(String, nullable=False)
    material_thickness = Column(Float, default=18.0)
    version = Column(Integer, default=1)
    thumbnail_path = Column(String, nullable=True)
    parsed_data = Column(Text, nullable=True)
    piece_roles = Column(Text, nullable=True)
    layer_depths_override = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )


class ImportedPiece(Base):
    __tablename__ = "imported_pieces"

    id = Column(String, primary_key=True)
    furniture_id = Column(String, nullable=False)
    layer = Column(String, nullable=False)
    role = Column(String, nullable=True)
    vertices = Column(Text, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    depth = Column(Float, default=0.0)
    quantity = Column(Integer, default=1)


def init_db() -> None:
    """Crea tablas si no existen. Idempotente. Aplica migraciones de columnas nuevas."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    # Migración: columnas añadidas después de la creación inicial
    with engine.connect() as conn:
        try:
            conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE imported_furniture ADD COLUMN layer_depths_override TEXT"
                )
            )
            conn.commit()
        except Exception:
            pass  # La columna ya existe — OK
