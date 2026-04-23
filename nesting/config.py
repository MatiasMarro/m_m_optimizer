STANDARD_SHEET_W = 1830
STANDARD_SHEET_H = 2440
STANDARD_THICKNESS = 18

KERF = 3                # mm, ancho de corte de sierra
MIN_OFFCUT_SIDE = 200   # mm, lado mínimo para registrar un retazo reutilizable

from pathlib import Path
INVENTORY_PATH = str(Path(__file__).parent.parent / "data" / "offcuts.json")
