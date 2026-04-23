# Rol
Arquitecto de software especializado en automatización CNC para carpintería.

# Contexto del negocio
- Carpintería con CNC (Mach3 + Vectric Aspire V8).
- 3 muebles/mes → objetivo 8–12 muebles/mes.
- 2 personas.

# Flujo actual (manual)
Diseño (AutoCAD/Fusion) → Exportación 2D → Nesting manual en Aspire → G-code → CNC.

# Objetivo técnico
Crear **capa inteligente** sobre herramientas existentes (no reemplazarlas) que automatice:
1. Diseño paramétrico de muebles semi-estándar (MDF 18mm).
2. Generación automática de piezas.
3. **Nesting optimizado con gestión de sobrantes (estilo Lepton Optimizer)**.
4. Cálculo de costos.
5. **[PRÓXIMO]** Interfaz visual con carga de DXF y visualización del nesting.

# Requerimiento clave
El módulo de nesting debe comportarse como **Lepton Optimizer** (Lepton Sistemas): 
- Optimización de corte en 2D.
- Aprovechamiento de retazos.
- Exportación compatible con Aspire.

# Restricciones
- Solución en Python.
- Modular.
- Respuestas concisas. No explicar lo obvio.

# Documentación de referencia
Ver `docs/lepton.md` para funcionalidades exactas de Lepton Optimizer a emular.

---

# ESTADO ACTUAL DEL CÓDIGO (snapshot — abril 2026)
> Leer esta sección antes de analizar archivos. Evita búsquedas redundantes.

## Dependencias
```
rectpack>=0.2.2   # bin-packing 2D
ezdxf>=1.0        # lectura/escritura DXF
```

## Estructura de archivos y responsabilidad

```
main.py                  ← Orquestador. run_pipeline() = API pura reutilizable por GUI.
                           CLI fina con argparse (subcomandos: cabinet, shelving).
parametric/
  base.py                ← ABC Furniture(ancho, alto, profundidad, espesor=18). Valida dims.
  cabinet.py             ← Cabinet: genera [lateral×2, tapa, base, estante×n, fondo].
  shelving.py            ← ShelvingUnit: estantería abierta.
nesting/
  models.py              ← Dataclasses: Piece, Sheet, PlacedPiece, SheetUsage, Layout.
  config.py              ← KERF=3mm, placa 1830×2440mm, MIN_OFFCUT_SIDE=200mm.
  optimizer.py           ← NestingOptimizer: algoritmo central (ver detalle abajo).
  inventory.py           ← OffcutInventory: CRUD retazos en data/offcuts.json.
  exporter.py            ← DXFExporter.export(layout, path): escribe DXF con 4 capas.
costing/
  models.py              ← CostBreakdown, HardwareItem.
  config.py              ← Tarifas ARS: placa $45k, CNC $8k/h, MO $3.5k/h, margen 40%.
  calculator.py          ← CostCalculator.compute(layout, pieces, horas_mo, herrajes).
data/offcuts.json        ← Inventario persistente de retazos (JSON).
output/nesting.dxf       ← Último DXF generado.
```

## Pipeline completo (`run_pipeline` en main.py)
```
Furniture.get_pieces() → [Piece]
  → apply_edging_policy()       # asigna flags tapacanto por nombre de pieza
  → NestingOptimizer.optimize() → Layout
  → CostCalculator.compute()    → CostBreakdown
  → DXFExporter.export()        → .dxf   (opcional)
  → ProjectResult(furniture, pieces, layout, costo, dxf_path, warnings)
```

## Algoritmo de nesting (optimizer.py)
- Motor: `rectpack` MaxRectsBssf, modo Offline, BFF bins.
- **Fase 1:** Piezas `grain_locked=True` sin rotación. Retazos primero (menor→mayor área).
- **Fase 2:** Piezas sin veta con rotación. Huecos libres de Fase 1 = "sub-bins virtuales".
- Kerf descontado: 3mm por corte.
- Retazos post-corte detectados si lado libre ≥ 200mm → `Layout.new_offcuts`.
- ⚠️ `new_offcuts` se detecta pero **no se persiste** automáticamente en `OffcutInventory`.

## Cálculo de costos (calculator.py)
| Rubro | Lógica |
|---|---|
| Placas nuevas | n × $precio_placa |
| Retazos consumidos | área × ($/mm²_std) × factor_0.5 |
| Tapacanto | metros lineales según `Piece.edged` (top/right/bottom/left) × precio/m |
| Tiempo CNC | Σ perímetros / velocidad_corte × costo_hora (sobreestima: no descuenta cortes compartidos) |
| Mano de obra | horas_mo × costo_hora_mo |
| Herrajes | HardwareItem(nombre, qty, precio_unitario) |
| Margen | 40% sobre subtotal |

## DXF (exporter.py)
- **Solo exportación** (ezdxf). No existe importación/lectura de DXF aún.
- Capas: `CONTORNO_PLACA` (blanco), `PIEZAS` (verde), `ETIQUETAS` (rojo), `RETAZOS` (magenta).
- Placas dispuestas horizontalmente con GAP=200mm entre sí.

## Interfaz de usuario
- **Solo CLI** (`argparse`). No hay GUI.
- Ejemplo: `python main.py cabinet --ancho 600 --alto 720 --profundidad 400 --estantes 2 --use-inventory --export output/nesting.dxf`

## Lo que NO está implementado (próximos pasos)
1. **DXF Importer** — `nesting/dxf_importer.py`: leer formas arbitrarias con ezdxf.
2. **Drag & drop en canvas** — reordenar piezas manualmente con snap a kerf.
3. ~~**Persistencia automática de retazos**~~ ✅ DONE — run_pipeline siempre crea OffcutInventory y optimizer persiste.
4. **Panel de tarifas editable** — editar `costing/config.py` desde UI sin tocar código.
5. **Nesting no-rectangular** — piezas con formas DXF reales (requiere pynest2d o similar).
6. **Persistencia de proyectos** — DB para guardar/cargar diseños (Local Storage por ahora).