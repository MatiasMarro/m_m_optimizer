"""Repositorio de imported furniture (SQLAlchemy).

Encapsula acceso a ImportedFurniture / ImportedPiece. Todas las funciones
abren y cierran su propia sesión vía backend.app.db.SessionLocal.
"""
from __future__ import annotations

import json
import uuid
from typing import Iterable, Optional

from backend.app import db as db_module
from backend.app.db import ImportedFurniture, ImportedPiece


def _session():
    """Obtiene una nueva sesión desde SessionLocal actual (respeta monkeypatching en tests)."""
    return db_module.SessionLocal()


def create_imported_furniture(
    id: str,
    name: str,
    dxf_path: str,
    thickness: float,
    thumbnail_path: Optional[str],
    parsed_data: dict,
) -> ImportedFurniture:
    """Inserta una fila en imported_furniture y la retorna."""
    session = _session()
    try:
        row = ImportedFurniture(
            id=id,
            name=name,
            dxf_path=dxf_path,
            material_thickness=thickness,
            thumbnail_path=thumbnail_path,
            parsed_data=json.dumps(parsed_data, ensure_ascii=False),
            version=1,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        session.expunge(row)
        return row
    finally:
        session.close()


def get_imported_furniture(furniture_id: str) -> Optional[ImportedFurniture]:
    """Retorna la fila (con sus piezas accesibles vía list_pieces_for) o None."""
    session = _session()
    try:
        row = session.get(ImportedFurniture, furniture_id)
        if row is None:
            return None
        session.expunge(row)
        return row
    finally:
        session.close()


def list_imported_furniture() -> list[ImportedFurniture]:
    """Lista todas las filas ordenadas por created_at desc."""
    session = _session()
    try:
        rows = (
            session.query(ImportedFurniture)
            .order_by(ImportedFurniture.created_at.desc())
            .all()
        )
        for r in rows:
            session.expunge(r)
        return rows
    finally:
        session.close()


def list_pieces_for(furniture_id: str) -> list[ImportedPiece]:
    """Lista piezas de un furniture_id."""
    session = _session()
    try:
        rows = (
            session.query(ImportedPiece)
            .filter(ImportedPiece.furniture_id == furniture_id)
            .all()
        )
        for r in rows:
            session.expunge(r)
        return rows
    finally:
        session.close()


def update_piece_roles(furniture_id: str, roles: dict[str, str]) -> bool:
    """Serializa roles en ImportedFurniture.piece_roles y actualiza role de cada pieza del layer."""
    session = _session()
    try:
        furn = session.get(ImportedFurniture, furniture_id)
        if furn is None:
            return False
        furn.piece_roles = json.dumps(roles, ensure_ascii=False)
        pieces = (
            session.query(ImportedPiece)
            .filter(ImportedPiece.furniture_id == furniture_id)
            .all()
        )
        for p in pieces:
            if p.layer in roles:
                p.role = roles[p.layer]
        session.commit()
        return True
    finally:
        session.close()


def delete_imported_furniture(furniture_id: str) -> bool:
    """Borra filas de imported_pieces y luego la de imported_furniture."""
    session = _session()
    try:
        furn = session.get(ImportedFurniture, furniture_id)
        if furn is None:
            return False
        session.query(ImportedPiece).filter(
            ImportedPiece.furniture_id == furniture_id
        ).delete(synchronize_session=False)
        session.delete(furn)
        session.commit()
        return True
    finally:
        session.close()


def upsert_pieces(
    furniture_id: str, contours: Iterable
) -> list[ImportedPiece]:
    """Reemplaza todas las piezas del furniture_id con las provistas."""
    session = _session()
    try:
        session.query(ImportedPiece).filter(
            ImportedPiece.furniture_id == furniture_id
        ).delete(synchronize_session=False)

        inserted: list[ImportedPiece] = []
        for c in contours:
            vertices_json = json.dumps([list(v) for v in c.vertices])
            piece = ImportedPiece(
                id=str(uuid.uuid4()),
                furniture_id=furniture_id,
                layer=c.layer,
                role=None,
                vertices=vertices_json,
                width=float(c.width),
                height=float(c.height),
                depth=float(c.depth),
                quantity=1,
            )
            session.add(piece)
            inserted.append(piece)
        session.commit()
        for p in inserted:
            session.refresh(p)
            session.expunge(p)
        return inserted
    finally:
        session.close()
