"""Test básico del módulo nesting."""

from nesting import (
    Piece,
    Sheet,
    NestingOptimizer,
    OffcutInventory,
    DXFExporter,
)

# Crear piezas de ejemplo (estilo mueble simple)
pieces = [
    Piece("lateral_500x800", width=500, height=800, qty=2),
    Piece("fondo_450x750", width=450, height=750, qty=1),
    Piece("tapa_500x500", width=500, height=500, qty=1),
    Piece("estante_400x700", width=400, height=700, qty=3),
]

# Placa estándar
std_sheet = Sheet(id="MDF18_STD", width=1830, height=2440, thickness=18)

# Inventario de retazos (vacío para este test)
inventory = OffcutInventory("data/offcuts.json")
offcuts = inventory.available()

print(f"Piezas a optimizar: {sum(p.qty for p in pieces)}")
print(f"Retazos disponibles: {len(offcuts)}")

# Optimizar
optimizer = NestingOptimizer(inventory=inventory)
layout = optimizer.optimize(pieces, std_sheet, offcuts=offcuts)

# Resultados
print(f"\n--- Resultados ---")
print(f"Placas usadas: {len(layout.sheets_used)}")
print(f"Piezas colocadas: {sum(len(u.placements) for u in layout.sheets_used)}")
print(f"Piezas no colocadas: {len(layout.unplaced)}")
if layout.unplaced:
    for p in layout.unplaced:
        print(f"  - {p.name} (qty={p.qty})")
print(f"Eficiencia: {layout.efficiency:.1%}")
print(f"Retazos nuevos: {len(layout.new_offcuts)}")

# Exportar a DXF
output_path = "output/nesting.dxf"
DXFExporter.export(layout, output_path)
print(f"\nDXF exportado a: {output_path}")
