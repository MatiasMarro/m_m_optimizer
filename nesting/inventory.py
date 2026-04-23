import json
import os
from typing import List
from .models import Sheet
from .config import INVENTORY_PATH


class OffcutInventory:
    """Persistencia de retazos en JSON.

    Formato: [{id, ancho, alto, x, y, usado}, ...]
    x, y son metadatos de origen (posición en la placa madre); no afectan nesting.
    """

    def __init__(self, path: str = INVENTORY_PATH):
        self.path = path
        self._items: List[dict] = []
        self.load()

    def load(self) -> None:
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                self._items = json.load(f)
        else:
            self._items = []

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._items, f, indent=2, ensure_ascii=False)

    def available(self) -> List[Sheet]:
        return [
            Sheet(id=it["id"], width=it["ancho"], height=it["alto"], is_offcut=True)
            for it in self._items if not it.get("usado", False)
        ]

    def mark_used(self, sheet_id: str) -> None:
        for it in self._items:
            if it["id"] == sheet_id:
                it["usado"] = True
                return

    def add(self, sheet: Sheet, origin_x: float = 0, origin_y: float = 0) -> None:
        self._items.append({
            "id": sheet.id,
            "ancho": sheet.width,
            "alto": sheet.height,
            "x": origin_x,
            "y": origin_y,
            "usado": False,
        })

    def next_id(self, prefix: str = "R") -> str:
        n = len(self._items) + 1
        return f"{prefix}{n:04d}"
