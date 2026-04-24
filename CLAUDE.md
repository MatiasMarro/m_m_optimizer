# m_m_optimizer-cnc

Automatización CNC para carpintería: nesting 2D, costos y exportación DXF sobre Mach3 + Vectric Aspire.

**Stack:** Python 3.11 · FastAPI · SQLAlchemy 2.0 · SQLite · rectpack · ezdxf · matplotlib · Pillow · React 18 · TypeScript · Vite · Konva · zustand · Tailwind CSS

---

## ARQUITECTURA

```
DXF (Aspire) → backend/app/dxf/parser.py → ParsedContour[]
    ↓
backend/app/routers/furniture_import.py → POST /api/furniture/import
    (guarda DXF + imágenes, genera thumbnail JPEG, persiste en SQLite via repo)

parametric/ → [Piece+Hole[]]
    ↓
nesting/optimizer.py → Layout (SheetUsage[], unplaced[], new_offcuts[])
    ↓
costing/calculator.py → CostBreakdown
    ↓
nesting/exporter.py → DXF (Mach3)
```

- `main.py::run_pipeline(furniture, *, standard_sheet, use_inventory, horas_mo, herrajes, edging_policy, dxf_path) → ProjectResult`
- `backend/app/dxf/parser.py` — `parse_aspire_dxf(path, thickness) → ParseResult`; clasifica layers por keywords + geometría → OperationType
- `backend/app/db.py` — SQLAlchemy 2.0; `ImportedFurniture` + `ImportedPiece`; `init_db()` idempotente; `data/furniture.db`; respeta `MM_DATA_DIR` env (modo .exe)
- `backend/app/repositories/furniture_repo.py` — session-per-operation; create/get/list/update_roles/delete/upsert_pieces + `list_pieces_for`; `_session()` vía `db_module.SessionLocal` (monkeypatcheable)
- `backend/app/routers/furniture_import.py` — POST import + CRUD; thumbnail JPEG 200×200; tests usan StaticPool :memory:
- `api/server.py` — FastAPI app; monta `furniture_router`; llama `init_db()`; CORS `localhost:5173`; serializa via `api/schemas.py` (Pydantic v2)
- `ui/src/lib/nestingUtils.ts` — helpers drag & drop: `snapToKerf`, `clampToSheet`, `hasCollision`, `piecesCollide`, `resolveDropPosition`, etc.
- Storage: `data/offcuts.json` · `data/projects/{id}.json` · `data/config.json` · `data/furniture.db` · `data/furniture/{id}/` (original.dxf, thumb.jpg, ref_NN.ext)

---

## ESTADO ACTUAL

Suite pytest **81/81 ✅**. Backend pipeline, API REST, SQLite persistence y UI tab DXF completos.
- Tab "Desde DXF" en Designer: drop zone → import → grid de FurnitureCards
- `RoleWizardModal.tsx`: modal por portal, dropdown de roles por layer, badge verde si configurado
- `GET /api/furniture` devuelve `piece_roles` en cada item
- Pendiente: Preview 2D vectorial en Designer (❌ placeholder)

---

## ENTIDADES CLAVE

| Entidad | Campos clave |
|---|---|
| `Piece` | name, width, height, qty, grain_locked, edged(4×bool), holes[] |
| `Sheet` | id, width, height, thickness, is_offcut |
| `PlacedPiece` | piece_name, sheet_id, x, y, width, height, rotated |
| `SheetUsage` | sheet_id, sheet_w/h, placed[], efficiency, is_offcut |
| `Layout` | sheets_used[], unplaced[], efficiency, new_offcuts[] |
| `CostBreakdown` | material_placas, tapacanto, tiempo_cnc, mano_obra, margen → total |
| `ProjectMeta` | id(uuid[:8]), nombre, created_at, furniture_tipo, ancho, alto, profundidad |
| `SavedProject` | meta, spec(FurnitureSpec), result(PipelineResponse) |
| `NestingCanvasHandle` | zoomIn(), zoomOut(), fit() — forwardRef |
| `TokenColors` | bg, surface, surface2, border, primary, accent, danger, text, textMuted, pieceGrain, pieceFree, offcut — hook `useTokenColors()` |
| `DragState` | fromSheetIdx, pieceIdx, pieceWidth, pieceHeight, toSheetIdx, collides |
| `FurnitureItem` | furniture_id, name, thumbnail_url, contours_count, layers[], piece_roles{layer:role}, created_at |
| `OperationType` | PROFILE(Z≈thickness), POCKET(0<Z<thickness), DRILL(Z>0), GROOVE, REFERENCE |
| `ParsedContour` | layer, op_type, vertices[], bbox, width, height, depth, tool_diameter?, is_through_cut |
| `ParseResult` | contours[], layer_summary{}, unrecognized_entities[], warnings[] |
| `ImportedFurniture` | id(uuid), name, dxf_path, material_thickness, version, thumbnail_path, parsed_data(JSON), piece_roles(JSON), created_at, updated_at |
| `ImportedPiece` | id(uuid), furniture_id, layer, role, vertices(JSON), width, height, depth, quantity |

---

## API REST (`:8000`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | liveness |
| POST | `/pipeline/run` | PipelineRequest → PipelineResponse |
| GET | `/inventory/offcuts` | lista retazos |
| GET/PUT | `/config/costing` | tarifas ↔ data/config.json |
| POST | `/projects` | SaveProjectRequest → ProjectMeta |
| GET/DELETE | `/projects` · `/projects/{id}` | listar / detalle / eliminar |
| POST | `/api/furniture/import` | multipart DXF+imgs → FurnitureImportResponse |
| GET | `/api/furniture/{id}/thumbnail` | JPEG 200×200 |
| GET | `/api/furniture` | lista ImportedFurniture[] desc |
| GET | `/api/furniture/{id}` | detalle + ImportedPiece[] |
| PUT | `/api/furniture/{id}/roles` | `{"roles":{layer:role}}` → actualiza piece_roles |
| DELETE | `/api/furniture/{id}` | elimina fila + piezas SQLite |

---

## CONFIGURACIÓN

> Sin `.env`. Fallbacks en `costing/config.py`; overrides en `data/config.json` (editable via `PUT /config/costing`).

| Clave | Default | Archivo |
|---|---|---|
| PRECIO_PLACA_MDF_18 | 45000 | costing/config.py |
| FACTOR_VALOR_RETAZO | 0.5 | costing/config.py |
| PRECIO_TAPACANTO_M | 800 | costing/config.py |
| COSTO_HORA_CNC | 8000 | costing/config.py |
| COSTO_HORA_MO | 3500 | costing/config.py |
| MARGEN | 0.40 | costing/config.py |
| KERF | 3 mm | nesting/config.py · data/config.json→kerf_mm |
| STANDARD_SHEET_W/H | 1830×2440 mm | nesting/config.py |
| MIN_OFFCUT_SIDE | 200 mm | nesting/config.py |
| INVENTORY_PATH | data/offcuts.json | nesting/config.py |

---

## COMANDOS

```bash
# Setup
python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
cd ui && npm install

# Dev
run.bat                                        # backend + frontend (Windows)
uvicorn api.server:app --reload --port 8000    # solo backend
cd ui && npm run dev                           # solo frontend → :5173

# Tests
python -m pytest tests/ -v
cd ui && npm run typecheck
cd ui && npm run gen:types    # regenera tipos TS (requiere backend en :8000)
```

---

## PRÓXIMOS PASOS

| Prior | Tarea | Archivo principal |
|---|---|---|
| ~~P1~~ | ~~UI import: drag DXF + thumbnail + grid~~ | ✅ `ui/src/views/Designer.tsx` |
| ~~P1~~ | ~~Wizard roles por layer~~ | ✅ `ui/src/components/RoleWizardModal.tsx` |
| ~~P1 deuda~~ | ~~Corregir `DATA_DIR` en `db.py`~~ | ✅ `backend/app/db.py` |
| P2 | Preview 2D vectorial SVG en Designer | `ui/src/components/DxfPreview.tsx` (nuevo) |
| P3 | Nesting no-rectangular con `pynest2d` | `nesting/optimizer.py` |
