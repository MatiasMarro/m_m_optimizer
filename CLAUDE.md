# PROJECT_IDENTITY
- **Name:** m_m_optimizer-cnc
- **Purpose:** Capa de automatización CNC sobre Mach3 + Vectric Aspire para carpintería (nesting 2D, costos, DXF).
- **Stack:** `Python 3.11+` · `FastAPI` · `rectpack` · `ezdxf` · `React 18` · `TypeScript` · `Vite` · `Konva` · `zustand` · `Tailwind CSS`

---

# ARCH_OVERVIEW
- `parametric/` genera `[Piece]` con `Hole[]` → pasa a `nesting/optimizer.py` → devuelve `Layout`
- `main.py::run_pipeline()` es la API pura del dominio; orquesta: `get_pieces → apply_edging_policy → NestingOptimizer → CostCalculator → DXFExporter`
- `api/server.py` envuelve `run_pipeline` como thin REST wrapper (FastAPI); serializa via `api/schemas.py` (Pydantic v2)
- `ui/` consume `POST /api/pipeline/run`, `GET /api/inventory/offcuts` y `CRUD /api/projects`; estado en `projectStore` (zustand, efímero en RAM)
- Storage persistente: `data/offcuts.json` (retazos) + `data/projects/{id}.json` (proyectos guardados, un JSON por proyecto)

---

# CURRENT_STATE

**Completado:**
- Pipeline completo backend: paramétrico → nesting 2 fases → costos → DXF
- API REST: health, pipeline/run, inventory/offcuts, CRUD completo de proyectos, GET/PUT config/costing
- UI funcional: Designer, Nesting (canvas read-only), Costs, Inventory, Export, Projects (lista + cargar + eliminar), **Settings (form de tarifas)**
- Persistencia de proyectos: `data/projects/` con JSON por proyecto, `ProjectMeta` + `SavedProject`
- Persistencia de tarifas: `data/config.json` — override de `costing/config.py`; `run_pipeline()` lo carga en cada ejecución
- Guardado desde `Export.tsx` con prompt de nombre; carga desde `Projects.tsx` restaura spec + result
- **Suite pytest: 25 tests, 25 passed** — `tests/` cubre parametric, nesting, costing, pipeline

**En progreso / parcial:**
- `ui/lib/types.ts` — sincronización manual con `api/schemas.py` (~80%, funcional pero sin automatizar)
- Canvas interactivo — renderizado OK, zoom/pan/drag sin implementar (~30%)
- Dashboard — KPIs hardcodeados, sin datos reales (~10%)

---

# CHANGES_THIS_SESSION
- **`tests/`** — directorio creado con suite pytest completa (25 tests, 25 passed)
- **`tests/conftest.py`** — fixtures: `std_sheet`, `cabinet_600`, `shelving_800`, `cabinet_pieces`, `cabinet_layout`; fixture `_isolate_inventory_cwd` aísla `OffcutInventory` del JSON real via `monkeypatch.chdir(tmp_path)`
- **`tests/test_parametric.py`** — 9 tests: conteo de piezas, dimensiones, grain_lock, holes por cara/canto, validaciones
- **`tests/test_nesting.py`** — 7 tests: placement completo, eficiencia, grain_locked sin rotación, offcuts mínimos, pieza imposible → unplaced
- **`tests/test_costing.py`** — 7 tests: total > 0, total == subtotal + margen, rubros, tapacanto, margen 40%, herrajes
- **`tests/test_pipeline.py`** — 4 tests: `ProjectResult` completo, warnings es lista, dxf_path None, error propagado
- **`requirements.txt`** — todas las deps fijadas con `==` (rectpack, ezdxf, fastapi, uvicorn, pydantic, pytest, pytest-cov)
- **`data/config.json`** — CREADO: override de tarifas; si existe, `run_pipeline()` lo usa en lugar de `costing/config.py`
- **`api/schemas.py`** — agregado `CostingConfig` (Pydantic v2)
- **`api/server.py`** — agregados `CONFIG_PATH`, `_read_costing_config()`, `GET /config/costing`, `PUT /config/costing`
- **`main.py`** — `run_pipeline()` lee `data/config.json` via `_read_config()` para instanciar `CostCalculator`; eliminado `calc_default_horas_mo()`
- **`ui/src/lib/types.ts`** — agregado `CostingConfig` interface
- **`ui/src/lib/api.ts`** — agregados `getConfig()` y `putConfig()`
- **`ui/src/views/Settings.tsx`** — form completo: carga tarifas, 8 campos editables, margen como %, Guardar con feedback

---

# CORE_ENTITIES

| Entidad | Campos clave | Relación |
|---|---|---|
| `Piece` | `name`, `width`, `height`, `qty`, `grain_locked`, `edged(4×bool)`, `holes[]` | generada por `Furniture.get_pieces()` |
| `Sheet` | `id`, `width`, `height`, `thickness`, `is_offcut` | bin en `NestingOptimizer`; retazos en `OffcutInventory` |
| `PlacedPiece` | `piece_name`, `sheet_id`, `x`, `y`, `width`, `height`, `rotated` | contenida en `SheetUsage.placements[]` |
| `SheetUsage` | `sheet`, `placements[]`, `free_rects[]` | elemento de `Layout.sheets_used[]` |
| `Layout` | `sheets_used[]`, `unplaced[]`, `efficiency`, `new_offcuts[]` | output de `NestingOptimizer.optimize()` |
| `CostBreakdown` | `material_placas`, `tapacanto`, `tiempo_cnc`, `mano_obra`, `margen` → `total` | output de `CostCalculator.compute()` |
| `Hole` | `x`, `y`, `diameter`, `depth`, `type(HoleType)`, `face(Face)` | lista en `Piece.holes[]`; dibujada por `DXFExporter` |
| `HardwareConfig` | `union_laterales`, `union_estantes`, `offset_front`, `offset_back` | campo de `Furniture`; controla tipo de perforación |
| `ProjectMeta` | `id`, `nombre`, `created_at`, `furniture_tipo`, `ancho`, `alto`, `profundidad` | índice en `GET /projects`; id = `uuid4()[:8]` |
| `SavedProject` | `meta`, `spec(FurnitureSpec)`, `result(PipelineResponse)` | archivo `data/projects/{id}.json` |

---

# API_SURFACE

## REST (`:8000`)
- `[GET] /health` → liveness check
- `[POST] /pipeline/run` → ejecuta pipeline completo; body: `PipelineRequest`, response: `PipelineResponse`
- `[GET] /inventory/offcuts` → lista retazos disponibles
- `[GET] /config/costing` → lee tarifas desde `data/config.json` (fallback a defaults hardcodeados)
- `[PUT] /config/costing` → escribe `data/config.json`; body y response: `CostingConfig`
- `[POST] /projects` → guarda proyecto; body: `SaveProjectRequest`, response: `ProjectMeta`
- `[GET] /projects` → lista todos los `ProjectMeta` (orden desc por `created_at`)
- `[GET] /projects/{id}` → retorna `SavedProject` completo
- `[DELETE] /projects/{id}` → elimina `data/projects/{id}.json`

## CLI (`main.py`)
- `python main.py cabinet --ancho N --alto N --profundidad N [--estantes N] [--use-inventory] [--export PATH]`
- `python main.py shelving --ancho N --alto N --profundidad N [--estantes N]`

## `run_pipeline()` (API interna)
```
run_pipeline(furniture, *, standard_sheet, use_inventory, horas_mo, herrajes, edging_policy, dxf_path) → ProjectResult
```

---

# CONFIG

> Sin `.env`. Todo hardcodeado en archivos de configuración de código fuente.

| Constante | Archivo | Propósito |
|---|---|---|
| `PRECIO_PLACA_MDF_18 = 45000` | `costing/config.py` | Fallback hardcodeado (si no existe `data/config.json`) |
| `FACTOR_VALOR_RETAZO = 0.5` | `costing/config.py` | Fallback hardcodeado |
| `PRECIO_TAPACANTO_M = 800` | `costing/config.py` | Fallback hardcodeado |
| `COSTO_HORA_CNC = 8000` | `costing/config.py` | Fallback hardcodeado |
| `COSTO_HORA_MO = 3500` | `costing/config.py` | Fallback hardcodeado |
| `MARGEN = 0.40` | `costing/config.py` | Fallback hardcodeado |
| `data/config.json` | archivo JSON | Override en runtime de todas las tarifas; editable via `PUT /config/costing` |
| `KERF = 3` | `nesting/config.py` | Ancho de corte mm |
| `STANDARD_SHEET_W/H = 1830/2440` | `nesting/config.py` | Dimensiones placa estándar mm |
| `MIN_OFFCUT_SIDE = 200` | `nesting/config.py` | Lado mínimo retazo reutilizable mm |
| `INVENTORY_PATH` | `nesting/config.py` | `Path(__file__).parent.parent / "data/offcuts.json"` (absoluto ✓) |
| `PROJECTS_DIR` | `api/server.py` | `Path(__file__).parent.parent / "data/projects"` (absoluto ✓) |
| `CONFIG_PATH` | `api/server.py` | `Path(__file__).parent.parent / "data/config.json"` (absoluto ✓) |
| CORS origins | `api/server.py` | Hardcoded `localhost:5173` + `127.0.0.1:5173` |

---

# COMMANDS

```bash
# Instalar backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Instalar frontend
cd ui && npm install

# Dev (backend)
uvicorn api.server:app --reload --port 8000

# Dev (frontend)
cd ui && npm run dev            # → http://localhost:5173

# Dev (todo junto - Windows)
run.bat                         # o run_debug.bat para ver errores

# Build frontend
cd ui && npm run build

# Typecheck frontend
cd ui && npm run typecheck

# Smoke tests (no hay pytest formal)
python test_nesting.py
python test_costing.py

# CLI manual
python main.py cabinet --ancho 600 --alto 720 --profundidad 400 --estantes 2 --export output/nesting.dxf

# Generar DXF desde API
# POST /pipeline/run con export_dxf: true → escribe output/nesting.dxf
```

---

# TODO_STATE

| Módulo | Feature pendiente | Prioridad |
|---|---|
| `ui/views/Settings.tsx` | ~~Editor de tarifas (`GET/PUT /config/costing` + form)~~ ✅ DONE | — |
| `ui/lib/types.ts` | Auto-sync con `api/schemas.py` via `openapi-typescript` | P0 |
| General | ~~Tests formales pytest + fixtures con `assert`~~ ✅ DONE (25/25) | — |
| `ui/views/Projects.tsx` | ~~CRUD persistente~~ ✅ DONE | — |
| `costing/calculator.py` | Tiempo CNC sobreestima (no deduplica cortes compartidos) | P1 |
| `nesting/` | `dxf_importer.py`: leer formas arbitrarias con `ezdxf` | P1 |
| `ui/components/canvas/` | Zoom/pan: conectar callbacks `CanvasToolbar` → `NestingCanvas` | P1 |
| `ui/components/canvas/` | Drag & drop piezas en canvas | P1 |
| `requirements.txt` | ~~Pinear versiones con `==`~~ ✅ DONE — todas las deps fijadas | — |
| `nesting/config.py` | ~~Fix `INVENTORY_PATH` relativo al CWD~~ ✅ DONE | — |
| `ui/views/Dashboard.tsx` | KPIs dinámicos desde proyectos persistidos + gráficos | P2 |
| `ui/views/Designer.tsx` | Preview 3D/2D del mueble (placeholder vacío) | P2 |
| General | Nesting no-rectangular con formas DXF reales (`pynest2d`) | P3 |

---

# NEXT_STEPS

1. **[P0] Auto-sync types TS:** Agregar `openapi-typescript` como devDependency; script `npm run gen:types` que llama `openapi-typescript http://localhost:8000/openapi.json -o src/lib/types.ts`.
2. **[P1] Zoom/pan del canvas:** Estado local `{ scale, offsetX, offsetY }` en `NestingCanvas`; pasar `onZoomIn/onZoomOut/onFit` desde `Nesting.tsx` a `CanvasToolbar`.
3. **[P2] Dashboard dinámico:** Leer `data/projects/*.json` y calcular KPIs reales (eficiencia promedio, retazos en stock, proyectos del mes).