# PROJECT_IDENTITY
- **Name:** m_m_optimizer-cnc
- **Purpose:** Capa de automatización CNC sobre Mach3 + Vectric Aspire para carpintería (nesting 2D, costos, DXF).
- **Stack:** `Python 3.11+` · `FastAPI` · `rectpack` · `ezdxf` · `React 18` · `TypeScript` · `Vite` · `Konva` · `zustand` · `Tailwind CSS`

---

# ARCH_OVERVIEW
- `parametric/` genera `[Piece]` con `Hole[]` → pasa a `nesting/optimizer.py` → devuelve `Layout`
- `main.py::run_pipeline()` es la API pura del dominio; orquesta: `get_pieces → apply_edging_policy → NestingOptimizer → CostCalculator → DXFExporter`
- `api/server.py` envuelve `run_pipeline` como thin REST wrapper (FastAPI); serializa via `api/schemas.py` (Pydantic v2)
- `ui/` consume `POST /api/pipeline/run` y `GET /api/inventory/offcuts`; estado en `projectStore` (zustand, efímero en RAM)
- `data/offcuts.json` es el único storage persistente; sin DB relacional ni servicios externos

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

---

# API_SURFACE

## REST (`:8000`)
- `[GET] /health` → liveness check
- `[POST] /pipeline/run` → ejecuta pipeline completo; body: `PipelineRequest`, response: `PipelineResponse`
- `[GET] /inventory/offcuts` → lista retazos disponibles

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
| `PRECIO_PLACA_MDF_18 = 45000` | `costing/config.py` | Precio placa nueva ARS |
| `FACTOR_VALOR_RETAZO = 0.5` | `costing/config.py` | Factor descuento retazo vs placa nueva |
| `PRECIO_TAPACANTO_M = 800` | `costing/config.py` | $/m tapacanto ARS |
| `COSTO_HORA_CNC = 8000` | `costing/config.py` | $/h máquina ARS |
| `COSTO_HORA_MO = 3500` | `costing/config.py` | $/h mano de obra ARS |
| `MARGEN = 0.40` | `costing/config.py` | Margen sobre subtotal |
| `KERF = 3` | `nesting/config.py` | Ancho de corte mm |
| `STANDARD_SHEET_W/H = 1830/2440` | `nesting/config.py` | Dimensiones placa estándar mm |
| `MIN_OFFCUT_SIDE = 200` | `nesting/config.py` | Lado mínimo retazo reutilizable mm |
| `INVENTORY_PATH = "data/offcuts.json"` | `nesting/config.py` | Path relativo al CWD |
| CORS origins | `api/server.py:12` | Hardcoded `localhost:5173` + `127.0.0.1:5173` |

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
|---|---|---|
| `ui/views/Settings.tsx` | Editor de tarifas (editar `costing/config.py` desde UI) | P0 |
| `ui/lib/types.ts` | Sincronización automática con `api/schemas.py` (manual ahora) | P0 |
| General | Tests formales con pytest/vitest + aserciones | P0 |
| `costing/calculator.py` | Tiempo CNC sobreestima (no deduplica cortes compartidos) | P1 |
| `nesting/` | `dxf_importer.py`: leer formas arbitrarias con `ezdxf` | P1 |
| `ui/components/canvas/` | Drag & drop piezas + zoom/pan (callbacks sin conectar) | P1 |
| `ui/views/Projects.tsx` | CRUD persistente de proyectos (sin DB aún) | P1 |
| `requirements.txt` | Pinear versiones con `==` para reproducibilidad | P1 |
| `nesting/config.py` | Resolver path `offcuts.json` relativo al CWD | P1 |
| `ui/views/Designer.tsx` | Preview 3D/2D del mueble (placeholder vacío) | P2 |
| `ui/views/Dashboard.tsx` | KPIs dinámicos + gráficos de tendencia (hardcoded) | P2 |
| General | Nesting no-rectangular con formas DXF reales (`pynest2d`) | P3 |

---

# NEXT_STEPS

1. **[P0] Fijar tipos TS ↔ Python:** Generar `ui/src/lib/types.ts` automáticamente desde `api/schemas.py` (script o `openapi-typescript`) para eliminar drift.
2. **[P0] Agregar pytest + fixtures:** Convertir `test_nesting.py` y `test_costing.py` en suites formales con `assert`; mínimo: nesting de Cabinet básico + breakdown de costos.
3. **[P0] Settings / tarifas editables:** Exponer `GET/PUT /config/costing` en API; widget en `Settings.tsx` para editar sin tocar código.
4. **[P1] Persistencia de proyectos:** `POST /projects` + `GET /projects/:id`; almacenar `ProjectResult` serializado en SQLite (`sqlite3` stdlib) o JSON en `data/projects/`.
5. **[P1] Conectar zoom/pan del canvas:** Pasar handlers desde `Nesting.tsx` a `CanvasToolbar`; implementar scale/offset en `NestingCanvas` con estado local.