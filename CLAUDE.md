# m_m_optimizer-cnc

Automatización CNC para carpintería: nesting 2D, costos y exportación DXF sobre Mach3 + Vectric Aspire.

**Stack:** Python 3.11 · FastAPI · rectpack · ezdxf · React 18 · TypeScript · Vite · Konva · zustand · Tailwind CSS

---

## ARQUITECTURA

```
DXF (Aspire) → backend/app/dxf/parser.py → ParsedContour[]
    ↓
parametric/ → [Piece+Hole[]]
    ↓
nesting/optimizer.py → Layout (SheetUsage[], unplaced[], new_offcuts[])
    ↓
costing/calculator.py → CostBreakdown
    ↓
nesting/exporter.py → DXF (Mach3)
```

- `main.py::run_pipeline()` — orquesta todo; es la API de dominio pura
- `backend/app/dxf/parser.py` — `parse_aspire_dxf(filepath, material_thickness) → ParseResult`; extrae Z desde entity.elevation o vértices; clasifica por layer keywords + geometría (PROFILE/POCKET/DRILL/GROOVE/REFERENCE)
- `api/server.py` — thin FastAPI wrapper sobre `run_pipeline`; serializa via `api/schemas.py` (Pydantic v2)
- `ui/` — SPA React; estado efímero en `projectStore` (zustand); tipos en `ui/src/lib/types.ts` (re-exporta `openapi.generated.ts`)
- `ui/src/lib/nestingUtils.ts` — helpers puros de dominio para drag & drop: `snapToKerf`, `clampToSheet`, `computeSheetOffsets`, `findDropSheet`, `hasCollision`, `piecesCollide`, `previewEfficiency`, `applyDragSnap`, `findNearestValidPosition`, `resolveDropPosition`, `computeSheetEfficiency`
- Storage: `data/offcuts.json` · `data/projects/{id}.json` · `data/config.json`

---

## ESTADO ACTUAL

| Módulo | Estado |
|---|---|
| Backend pipeline completo (parametric→nesting→costing→DXF) | ✅ |
| API REST completa (health, pipeline, offcuts, projects CRUD, config) | ✅ |
| UI: Designer, Nesting, Costs, Inventory, Export, Projects, Settings | ✅ |
| Canvas: zoom/pan/fit (wheel + botones + auto-fit) | ✅ |
| Canvas: render correcto (CSS tokens resueltos, altura, pan sin ciclos) | ✅ |
| Persistencia proyectos (`data/projects/`) | ✅ |
| Persistencia tarifas (`data/config.json`) | ✅ |
| Suite pytest 27/27 | ✅ |
| Types TS auto-generados desde OpenAPI (`npm run gen:types`) | ✅ |
| Dashboard con KPIs dinámicos (proyectos/mes, eficiencia, retazos) | ✅ |
| Fix tiempo CNC: deduplicar cortes compartidos (kerf-aware) | ✅ |
| kerf configurable desde Settings UI → pipeline | ✅ |
| Drag & drop piezas: snap kerf, transferencia entre placas, eficiencia en vivo | ✅ |
| DXF importer (Aspire → Piece): parser, extracción Z, tipo operación | ✅ |
| Preview 3D/2D en Designer | ❌ placeholder |

---

## ENTIDADES CLAVE

| Entidad | Campos clave |
|---|---|
| `Piece` | `name`, `width`, `height`, `qty`, `grain_locked`, `edged(4×bool)`, `holes[]` |
| `Sheet` | `id`, `width`, `height`, `thickness`, `is_offcut` |
| `PlacedPiece` | `piece_name`, `sheet_id`, `x`, `y`, `width`, `height`, `rotated` |
| `SheetUsage` | `sheet_id`, `sheet_width`, `sheet_height`, `placed[]`, `efficiency`, `is_offcut` |
| `Layout` | `sheets_used[]`, `unplaced[]`, `efficiency`, `new_offcuts[]` |
| `CostBreakdown` | `material_placas`, `tapacanto`, `tiempo_cnc`, `mano_obra`, `margen` → `total` |
| `ProjectMeta` | `id(uuid[:8])`, `nombre`, `created_at`, `furniture_tipo`, `ancho`, `alto`, `profundidad` |
| `SavedProject` | `meta`, `spec(FurnitureSpec)`, `result(PipelineResponse)` |
| `NestingCanvasHandle` | `zoomIn()`, `zoomOut()`, `fit()` — ref via `forwardRef` |
| `TokenColors` | `bg`, `surface`, `surface2`, `border`, `primary`, `accent`, `danger`, `text`, `textMuted`, `pieceGrain`, `pieceFree`, `offcut` — hook `useTokenColors()` |
| `DragState` | `fromSheetIdx`, `pieceIdx`, `pieceWidth`, `pieceHeight`, `toSheetIdx`, `collides` — estado interno de NestingCanvas durante drag |
| `OperationType` | PROFILE (corte perimetral, Z ≈ thickness), POCKET (cajeado, 0 < Z < thickness), DRILL (taladro, Z > 0), GROOVE (ranura), REFERENCE (sin mecanizado) |
| `ParsedContour` | `layer`, `op_type`, `vertices[]`, `bbox`, `width`, `height`, `depth`, `tool_diameter?`, `is_through_cut` |
| `ParseResult` | `contours[]`, `layer_summary{}`, `unrecognized_entities[]`, `warnings[]` |

---

## API REST (`:8000`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | liveness |
| POST | `/pipeline/run` | body: `PipelineRequest` → `PipelineResponse` |
| GET | `/inventory/offcuts` | lista retazos |
| GET/PUT | `/config/costing` | tarifas desde/hacia `data/config.json` |
| POST | `/projects` | guardar; body: `SaveProjectRequest` → `ProjectMeta` |
| GET | `/projects` | listar `ProjectMeta[]` (desc por fecha) |
| GET | `/projects/{id}` | `SavedProject` completo |
| DELETE | `/projects/{id}` | elimina `data/projects/{id}.json` |

**`run_pipeline()` signature:**
```python
run_pipeline(furniture, *, standard_sheet, use_inventory, horas_mo, herrajes, edging_policy, dxf_path) → ProjectResult
```

---

## CONFIGURACIÓN

> Sin `.env`. Fallbacks en `costing/config.py`; overrides en `data/config.json` (editable via `PUT /config/costing`).

| Clave | Valor default | Archivo |
|---|---|---|
| `PRECIO_PLACA_MDF_18` | 45000 | `costing/config.py` |
| `FACTOR_VALOR_RETAZO` | 0.5 | `costing/config.py` |
| `PRECIO_TAPACANTO_M` | 800 | `costing/config.py` |
| `COSTO_HORA_CNC` | 8000 | `costing/config.py` |
| `COSTO_HORA_MO` | 3500 | `costing/config.py` |
| `MARGEN` | 0.40 | `costing/config.py` |
| `KERF` | 3 mm | `nesting/config.py` (fallback código) · configurable via `data/config.json` → `kerf_mm` |
| `STANDARD_SHEET_W/H` | 1830×2440 mm | `nesting/config.py` |
| `MIN_OFFCUT_SIDE` | 200 mm | `nesting/config.py` |
| `INVENTORY_PATH` | `data/offcuts.json` (absoluto) | `nesting/config.py` |
| `cacheDir` Vite | `os.tmpdir()/vite-m_m_optimizer` | `ui/vite.config.ts` |
| CORS origins | `localhost:5173`, `127.0.0.1:5173` | `api/server.py` |

---

## COMANDOS

```bash
# Setup
python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
cd ui && npm install

# Dev
run.bat                              # backend + frontend + abre navegador (Windows)
uvicorn api.server:app --reload --port 8000   # solo backend
cd ui && npm run dev                 # solo frontend → :5173

# Tests y calidad
python -m pytest tests/ -v
cd ui && npm run typecheck
cd ui && npm run gen:types           # regenera tipos TS (requiere backend en :8000)

# CLI
python main.py cabinet --ancho 600 --alto 720 --profundidad 400 --estantes 2 --export output/nesting.dxf
```

---

## DXF IMPORTER

**`backend/app/dxf/parser.py`** — Parser de DXF exportado por Vectric Aspire.

- **Entrada:** filepath (DXF) + material_thickness (mm)
- **Salida:** `ParseResult` con lista de `ParsedContour` (vértices 2D, profundidad Z, tipo operación, diámetro herramienta)
- **Clasificación operación:**
  1. Por keyword en layer (drill, pocket, groove, ref, profile) → enum OperationType
  2. Por geometría: CIRCLE → DRILL; Z ≈ thickness → PROFILE (is_through_cut=True); 0 < Z < thickness → POCKET
- **Extracción Z:** entity.dxf.elevation (LWPOLYLINE) o primer vértice Z (POLYLINE, SPLINE, LINE, ARC)
- **Diámetro herramienta:** De layer (_6mm, _D8, dia6, fresa6) o radio * 2 para CIRCLE
- **Vértices:** Aproximación a 32 segmentos (CIRCLE), 16 (ARC); flattenning (SPLINE); cierre automático si polyline.closed=True
- **Tests:** 40 tests (`tests/dxf/test_parser.py`) cubriendo regex, clasificación, geometry, fixture auto-generated

---

## PRÓXIMOS PASOS

| Prioridad | Tarea | Estado | Archivo principal |
|---|---|---|---|
| P1 | DXF importer: parser + endpoint `/api/dxf/parse` | ✅ parser | `backend/app/dxf/parser.py` (40 tests) |
| P1 (cont) | Integrar parser con UI: drag DXF → Designer | ❌ | `ui/src/views/Designer.tsx` + endpoint |
| P2 | Preview 3D/2D en Designer | ❌ | `ui/src/views/Designer.tsx` |
| P3 | Nesting no-rectangular con `pynest2d` | ❌ | `nesting/optimizer.py` |
