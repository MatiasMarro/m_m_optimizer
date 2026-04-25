# m_m_optimizer-cnc

Optimizador CNC para carpintería: diseño paramétrico → nesting 2D → costos → DXF para Mach3/Vectric Aspire. También importa muebles desde DXF de Aspire (con metadata de `.crv3d` nativo).

**Stack:** Python 3.11 · FastAPI · Pydantic v2 · SQLAlchemy 2.0 · SQLite · `rectpack` · `ezdxf` · `olefile` · matplotlib · Pillow · React 18 · TypeScript · Vite · Konva · zustand · Tailwind · React Router.

**Deploy dual:** dev (uvicorn :8000 + Vite :5173) o `.exe` PyInstaller (launcher.py + ui/dist embebido + datos en `%APPDATA%`).

---

## ARQUITECTURA — pipeline central

```
┌──────────────── input ────────────────┐
│  parametric/  (Cabinet, ShelvingUnit) │   diseño paramétrico
│  backend/app/dxf/parser.py            │   import DXF de Aspire
│  backend/app/dxf/crv_parser.py        │   .crv3d → metadata + GIF (no parsea vectores)
└─────────────────┬─────────────────────┘
                  ▼
        ┌───── pieces[Piece+Hole[]] ─────┐
        ▼                                ▼
   nesting/optimizer.py            costing/calculator.py
   (2-fase grain-aware,        (material+tapacanto+CNC+MO+
    MaxRectsBssf, kerf)         herrajes+margen, kerf-aware)
        │                                │
        ▼                                ▼
      Layout                       CostBreakdown
        │
        ▼
   nesting/exporter.py → DXF (capas: CONTORNO_PLACA, PIEZAS, ETIQUETAS, RETAZOS, TALADRO_*, MARCA_CANTO)

`main.run_pipeline(furniture, *, standard_sheet, use_inventory, horas_mo, herrajes, edging_policy, dxf_path) → ProjectResult`
es el ORQUESTADOR ÚNICO. CLI (main.py) y API (api/server.py::POST /pipeline/run) son thin wrappers.
```

---

## MAPA DE MÓDULOS

| Path | Responsabilidad | Notas |
|---|---|---|
| `main.py` | `run_pipeline()` + CLI argparse + `apply_edging_policy()` | DEFAULT_EDGING mapea `name → (top,right,bottom,left)` |
| `parametric/base.py` | `Furniture` ABC, `MDF_THICKNESS=18`, `BACK_INSET=10`, `SHELF_INSET=2` | `__post_init__` valida dims |
| `parametric/cabinet.py` `shelving.py` | Generan `[Piece]` + holes para uniones | Usan `junction_face_holes` / `junction_edge_holes` |
| `parametric/holes.py` | Sistema 32 (`SYS32_OFFSET=37`), `HardwareConfig`, builders de `Hole` | Diám/profundidad por `JunctionHardware` |
| `nesting/models.py` | `Piece`, `Sheet`, `PlacedPiece`, `SheetUsage`, `Layout`, `Hole`, `HoleType`, `Face`, `rotate_hole_cw()` | Coords inf-izq |
| `nesting/optimizer.py` | `NestingOptimizer.optimize()` — 2-fase grain | Fase 1 grain_locked sin rot; Fase 2 free con rot, usando free_rects de F1 como sub-bins virtuales |
| `nesting/inventory.py` | `OffcutInventory` JSON persistido; keys ESPAÑOL (`ancho`, `alto`, `usado`) | `MIN_OFFCUT_SIDE=200mm` filtra retazos chicos |
| `nesting/exporter.py` | `DXFExporter.export(layout, path)` | `GAP=200mm` entre placas; etiquetas FACE_UP círculos, EDGE_* marcas |
| `nesting/config.py` | `KERF=3`, `STANDARD_SHEET_W/H=1830/2440`, `MIN_OFFCUT_SIDE=200`, `INVENTORY_PATH` | KERF se SUMA al rect antes de packear |
| `costing/calculator.py` | `CostCalculator.compute()` con kerf-aware perimeter merging | Adyacencia exacta a kerf → resta overlap (corte compartido) |
| `costing/models.py` | `CostBreakdown` (props: `material`, `subtotal`, `total`), `HardwareItem` | `pretty()` formatea CLI |
| `costing/config.py` | Tarifas por defecto (ARS) | Override vía `data/config.json` |
| `api/server.py` | FastAPI app, CORS `:5173`, monta `furniture_router`, llama `init_db()`, SPA fallback en modo .exe | `_serialize()` Layout/Cost → DTO |
| `api/schemas.py` | Pydantic v2 — fuente de verdad de tipos | TS regenera con `npm run gen:types` |
| `backend/app/db.py` | SQLAlchemy 2.0 — `ImportedFurniture` + `ImportedPiece` tablas | Respeta `MM_DATA_DIR` env |
| `backend/app/dxf/parser.py` | `parse_aspire_dxf(path, thickness) → ParseResult` | Clasifica layer por keyword (regex), tipo por geometría+Z |
| `backend/app/dxf/crv_parser.py` | `parse_aspire_crv3d_metadata(path) → Crv3dMetadata` + `extract_preview_gif()` | OLE2 → version, MaterialSize doubles, layer names UTF-16, GIF preview. NO parsea contornos (CArchive propietario) |
| `backend/app/repositories/furniture_repo.py` | session-per-operation; `_session()` lee `db_module.SessionLocal` (monkeypatcheable) | CRUD + `upsert_pieces` + `update_piece_roles` |
| `backend/app/routers/furniture_import.py` | `POST /api/furniture/import` + CRUD; thumbnail JPEG 200×200; computa `layer_depths` (mediana) | Acepta `.dxf` y `.crv3d`; `.crv3d` → 422 con metadata + GIF base64 |
| `launcher.py` | Entry point .exe: puerto libre 8765+, hilo demonio uvicorn, abre browser | Setea `MM_DATA_DIR=%APPDATA%/m_m_optimizer-cnc/data` |
| `m_m_optimizer.spec` | PyInstaller spec; incluye `ui/dist`; excluye numpy/PIL/pandas | hiddenimports listados explícitos |
| `ui/src/router.tsx` | 8 rutas: `/`, `/projects`, `/designer`, `/nesting`, `/inventory`, `/costs`, `/export`, `/settings` | Layout via `AppShell` (TopBar+RailNav+StatusBar+Outlet) |
| `ui/src/store/projectStore.ts` | zustand: spec, result, movePiece (recomputa efficiency) | `defaultSpec` cabinet 600×720×400 |
| `ui/src/store/themeStore.ts` | zustand light/dark, persistido en `localStorage["mm:theme"]`, toggle `<html class="dark">` | |
| `ui/src/lib/api.ts` | Cliente fetch — `req<T>()` para JSON, `importFurniture` multipart con detección de `Crv3dNotSupportedError` | Lanza Error 4xx/5xx con body |
| `ui/src/lib/types.ts` | Re-export desde `openapi.generated.ts` | NO editar manual |
| `ui/src/lib/nestingUtils.ts` | `snapToKerf`, `clampToSheet`, `piecesCollide`, `applyDragSnap`, `findNearestValidPosition`, `resolveDropPosition` | Drag & drop kerf-aware |
| `ui/src/lib/useTokenColors.ts` | Hook devuelve LIGHT/DARK colors hex (para Konva) | Tailwind usa CSS vars; este hook expone los hex resolved |
| `ui/src/views/Designer.tsx` | Tabs Paramétrico / Desde DXF; drop-zone; grid de FurnitureCard; modal preview SVG; modal `.crv3d` con metadata + GIF | 645 líneas |
| `ui/src/views/Nesting.tsx` | `NestingCanvas` Konva + `InspectorPanel` con piezas/unplaced/new_offcuts | Lee kerf de `/config/costing` |
| `ui/src/components/canvas/NestingCanvas.tsx` | Stage Konva forwardRef con zoomIn/zoomOut/fit; drag con snap+collision; hover info | 537 líneas |
| `ui/src/components/DxfPreview.tsx` | SVG preview vectorial: bbox + flip-Y, polygon (closed) o polyline, color por categoría de layer | `vector-effect: non-scaling-stroke` |
| `ui/src/components/RoleWizardModal.tsx` | Portal modal: rol por layer + muestra `Z=X mm` (de `layer_depths`) | Roles fijos en `ROLE_OPTIONS` |

---

## ENTIDADES CLAVE

| Entidad | Campos / Notas |
|---|---|
| **Backend** | |
| `Piece` | name, width, height, qty, grain_locked, edged(top,right,bottom,left), holes[] |
| `Hole` | x, y, diameter, depth (-1=pasante), type:HoleType, face:Face=FACE_UP |
| `HoleType` | TARUGO, MINIFIX_CARCASA, MINIFIX_PERNO, TORNILLO |
| `Face` | FACE_UP/DOWN, EDGE_LEFT/RIGHT/BOTTOM/TOP — coords (x,y) son proyección sobre cara |
| `Sheet` | id, width, height, thickness=18, is_offcut=False |
| `PlacedPiece` | piece_name, sheet_id, x, y, width, height, rotated, holes[] |
| `SheetUsage` | sheet, placements[], free_rects[(x,y,w,h)] |
| `Layout` | sheets_used[], unplaced[], efficiency, new_offcuts[] |
| `CostBreakdown` | material_placas, material_retazos, tapacanto, tiempo_cnc, mano_obra, herrajes, margen → `subtotal`, `total` props |
| `HardwareConfig` | union_laterales, union_estantes, offset_front, offset_back (default Sistema 32) |
| `Furniture` (ABC) | ancho, alto, profundidad, espesor=18, hardware → `get_pieces() → [Piece]` |
| `ProjectResult` | furniture, pieces, layout, costo, dxf_path, warnings |
| `ImportedFurniture` (DB) | id (UUID), name, dxf_path, material_thickness, version, thumbnail_path, parsed_data(JSON), piece_roles(JSON), created_at, updated_at |
| `ImportedPiece` (DB) | id, furniture_id, layer, role, vertices(JSON), width, height, depth, quantity |
| `OperationType` | PROFILE(Z≈thickness), POCKET(0<Z<thickness), DRILL(Z>0 circle), GROOVE, REFERENCE |
| `ParsedContour` | layer, op_type, vertices[(x,y)], bbox, width, height, depth, tool_diameter?, is_through_cut |
| `ParseResult` | contours[], layer_summary{}, unrecognized_entities[], warnings[] |
| `Crv3dMetadata` | aspire_version, material_width_mm, material_height_mm, material_thickness_mm, layer_names[], has_preview_gif, streams[] |
| `Crv3dExportRequiredError` | NotImplementedError con `.metadata` adjunta |
| **Frontend** | |
| `FurnitureSpec` | tipo("cabinet"\|"shelving"), ancho, alto, profundidad, espesor=18, num_estantes=1, con_fondo=true |
| `FurnitureItem` | furniture_id, name, thumbnail_url, contours_count, layers[], **layer_depths{layer:mm}**, piece_roles{}, created_at |
| `FurnitureDetail` | extends FurnitureItem + material_thickness + pieces[FurniturePiece] |
| `Crv3dNotSupportedError` | clase JS en `api.ts` con `.metadata` y `.previewGifBase64` |
| `NestingCanvasHandle` | zoomIn(), zoomOut(), fit() — forwardRef API |
| `TokenColors` | bg, surface, surface2, border, primary, accent, danger, text, textMuted, pieceGrain, pieceFree, offcut |
| `DragState` | fromSheetIdx, pieceIdx, pieceWidth, pieceHeight, toSheetIdx, collides |

---

## API REST (`:8000`)

Todas las rutas están **sin** prefijo `/api` salvo `furniture_router` que sí lo trae (`/api/furniture/*`). En dev, Vite proxy reescribe `/api/*` → backend (strip `/api`) excepto `/api/furniture/*` (passthrough).

| Método | Ruta backend | Descripción |
|---|---|---|
| GET | `/health` | liveness + copyright |
| POST | `/pipeline/run` | `PipelineRequest` → `PipelineResponse` (corre `run_pipeline`) |
| GET | `/inventory/offcuts` | retazos disponibles |
| GET/PUT | `/config/costing` | tarifas ↔ `data/config.json` (margen va como ratio 0..1) |
| POST | `/projects` | `SaveProjectRequest` → `ProjectMeta` (uuid[:8]); guarda `SavedProject` JSON |
| GET | `/projects` | lista `ProjectMeta[]` desc por `created_at` |
| GET | `/projects/{id}` | `SavedProject` (meta+spec+result completo) |
| DELETE | `/projects/{id}` | borra archivo |
| POST | `/api/furniture/import` | multipart `(name, material_thickness, dxf_file, reference_images[])`. Para `.crv3d`: limpia furniture_dir y lanza 422 con `{code:"crv3d_not_supported", message, metadata, preview_gif_base64}` |
| GET | `/api/furniture` | `FurnitureItem[]` con `layer_depths` (mediana) |
| GET | `/api/furniture/{id}` | detalle + `ImportedPiece[]` |
| GET | `/api/furniture/{id}/thumbnail` | JPEG 200×200 (matplotlib RenderContext + Frontend) |
| PUT | `/api/furniture/{id}/roles` | `{"roles":{layer:role}}` → `piece_roles` JSON + propaga a piezas |
| DELETE | `/api/furniture/{id}` | borra DB rows + `data/furniture/{id}/` |

---

## ALMACENAMIENTO

| Path | Formato | Contenido |
|---|---|---|
| `data/config.json` | JSON | Tarifas costing (override de defaults) |
| `data/offcuts.json` | JSON | Inventario retazos — keys español (`ancho`, `alto`, `usado`) |
| `data/projects/{id}.json` | JSON | `SavedProject` completo (meta+spec+result) |
| `data/furniture.db` | SQLite | `imported_furniture` + `imported_pieces` |
| `data/furniture/{id}/` | dir | `original.dxf` o `original.crv3d` + `thumb.jpg` + `ref_NN.{jpg,png,webp}` |
| Modo .exe | — | `MM_DATA_DIR=%APPDATA%/m_m_optimizer-cnc/data` (launcher.py lo setea) |

---

## CONFIGURACIÓN

> **Sin `.env`.** Defaults en `costing/config.py` y `nesting/config.py`; overrides en `data/config.json` editable vía `PUT /config/costing` o UI Settings.

| Clave (config.json) | Default | Origen |
|---|---|---|
| `precio_placa_mdf18` | 45000 | costing/config.py |
| `factor_valor_retazo` | 0.5 | costing/config.py |
| `precio_tapacanto_m` | 800 | costing/config.py |
| `costo_hora_cnc` | 8000 | costing/config.py |
| `velocidad_corte_mm_min` | 3000 | costing/config.py |
| `costo_hora_mo` | 3500 | costing/config.py |
| `horas_mo_default` | 4.0 | costing/config.py |
| `margen` | 0.40 (ratio) | UI Settings lo muestra ×100 (=40%) |
| `kerf_mm` | 3.0 | nesting/config.py |
| (no editable) `STANDARD_SHEET_W/H` | 1830 × 2440 mm | nesting/config.py |
| (no editable) `MIN_OFFCUT_SIDE` | 200 mm | nesting/config.py |

---

## CONVENCIONES & IDIOMAS

- **Coordenadas:** origen inferior-izquierdo en TODO (Konva, DXF, Hole, PlacedPiece). En SVG (`DxfPreview`) se aplica `transform="scale(1,-1)"` para invertir.
- **Idioma:** dominio en **español** (Piece names: "lateral", "tapa", "fondo"; offcut JSON: `ancho/alto/usado`); código y comments en español/inglés mezclados; UI en español.
- **Tipos:** Pydantic v2 en `api/schemas.py` es la fuente de verdad. TS se regenera vía `npm run gen:types` (requiere backend en :8000). Nunca editar `openapi.generated.ts`.
- **Estilo:** dataclasses para modelos, Pydantic solo en API boundary, `from __future__ import annotations` en módulos nuevos.
- **Theming:** Tailwind usa CSS vars (`var(--primary)` etc.) definidas en `ui/src/styles/globals.css`; para canvas Konva usar `useTokenColors()` que retorna hex resolved según tema activo.
- **Modales:** patrón consistente — `createPortal` a `document.body`, backdrop `fixed inset-0 z-50 bg-black/50 backdrop-blur-sm`, dialog con `role="dialog" aria-modal aria-labelledby`, ESC cierra, click fuera cierra.
- **Errores HTTP:** 400 input inválido, 422 reglas de negocio (thickness fuera de rango, `.crv3d`), 404 not found, 500 DB.
- **Naming:** `snake_case` Python, `camelCase` TS, paths URL en inglés excepto `/inventory/offcuts`.

---

## GOTCHAS (no obvios — leer antes de modificar)

1. **Vite proxy doble regla**: `/api/furniture/*` pasa tal cual al backend (que tiene prefix `/api/furniture`); el resto de `/api/*` strip-ea `/api` (backend NO usa prefix `/api` para `/pipeline/run`, `/inventory/*`, `/projects`, `/config/*`).
2. **KERF se SUMA a las dimensiones** del rectángulo ANTES de pasarlo a `rectpack` (`p.width + kerf`, `p.height + kerf`). Al desempacar se resta para reportar el tamaño real. Adyacencia "exacta a kerf" → corte compartido (costing resta overlap).
3. **2-fase grain**: si hay piezas con `grain_locked=True`, fase 1 las empaca sin rotación; los `free_rects` resultantes se convierten en bins virtuales (`V::sheet_id::i`) para fase 2 (sin grain, con rotación). Al merge, los placements en virtuales se reubican en su placa padre con offset.
4. **`MIN_OFFCUT_SIDE=200mm`**: retazos con cualquier lado < 200 NO se persisten en inventory (descarte silencioso).
5. **`MM_DATA_DIR` env**: `db.py` y `api/server.py` lo respetan. `launcher.py` lo setea en modo .exe a `%APPDATA%/m_m_optimizer-cnc/data`. En tests no se setea → usa `data/` del repo.
6. **`DATA_DIR` en `furniture_import.py` está hardcodeado a `parents[3]/data`** — NO respeta `MM_DATA_DIR` directamente; el aislamiento en tests se hace monkeypatch-eando `FURNITURE_DIR`. La DB sí respeta `MM_DATA_DIR` vía `db.py`.
7. **`furniture_repo._session()` resuelve `db_module.SessionLocal` cada llamada** — NO cachea — para que tests puedan monkeypatch-ear `db_module.engine` / `SessionLocal` con SQLite in-memory + `StaticPool`.
8. **`apply_edging_policy` matchea por `Piece.name`** (no por role). Roles aplican a las piezas IMPORTADAS, no a las paramétricas.
9. **`.crv3d` parse**: `parse_aspire_crv3d()` SIEMPRE lanza `Crv3dExportRequiredError` (la firma existe por simetría, pero el formato propietario MFC `CArchive` es ileíble). Solo `parse_aspire_crv3d_metadata()` extrae datos reales.
10. **Margen UI vs API**: en `Settings.tsx` se muestra como porcentaje (×100). Backend lo recibe/guarda como ratio (0..1). La conversión está en `Settings.tsx::save` y `useEffect`.
11. **Frontend `runPipeline({export_dxf: true})`**: el backend genera DXF en `output/nesting.dxf` (path hardcodeado en `api/server.py`).
12. **Theme dark**: clase en `<html>`, persistida en `localStorage["mm:theme"]`; aplicada eagerly al import de `themeStore.ts`.
13. **`ezdxf` rendering** (thumbnail) requiere matplotlib `Agg` backend — se setea al import de `furniture_import.py`. NO importar matplotlib antes que ese módulo.
14. **`init_db()` se llama dos veces** (una en `api/server.py`, otra en import de `furniture_import.py`). Es idempotente (`create_all`), pero si agregás migraciones tener cuidado.
15. **Vite cacheDir** en `os.tmpdir()/vite-m_m_optimizer` — NO en `node_modules/.vite` para evitar conflicts en Windows.

---

## COMANDOS

```bash
# Setup
python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
cd ui && npm install

# Dev (Windows: doble-click run.bat lanza ambos)
uvicorn api.server:app --reload --port 8000     # backend
cd ui && npm run dev                            # frontend → :5173

# Tests
venv\Scripts\python.exe -m pytest tests/ -v     # 100/100
cd ui && npx tsc --noEmit                       # TS typecheck
cd ui && npm run gen:types                      # regen TS desde OpenAPI (requiere backend up)

# CLI directo
python main.py cabinet --ancho 600 --alto 720 --profundidad 400 --estantes 2 --export output/test.dxf

# Build .exe (Windows)
cd ui && npm run build                          # genera ui/dist
pyinstaller m_m_optimizer.spec                  # → dist/m_m_optimizer/m_m_optimizer.exe
# Instalador opcional: installer/m_m_optimizer.iss (Inno Setup) → installer/output/
```

---

## TESTING

- **Suite:** `pytest 100/100` (al 2026-04-25). Suite UI: solo `tsc --noEmit` (no hay vitest hoy).
- **Aislamiento global:** `tests/conftest.py::_isolate_inventory_cwd` — `monkeypatch.chdir(tmp_path)` para que `INVENTORY_PATH` relativo (`data/offcuts.json`) no toque el archivo real.
- **DXF tests:** `tests/dxf/conftest.py` (no hay; los tests definen sus propios fixtures locales).
- **DB isolation pattern** (en `test_furniture_db.py::_isolate_db`):
  ```python
  eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
  monkeypatch.setattr(db_module, "engine", eng)
  monkeypatch.setattr(db_module, "SessionLocal", sessionmaker(bind=eng))
  db_module.Base.metadata.create_all(eng)
  ```
- **Furniture dir isolation:** `monkeypatch.setattr(fi_mod, "FURNITURE_DIR", tmp_path / "furniture")`.
- **Fixtures:** `tests/fixtures/aspire_sample.dxf` (auto-generado con ezdxf si falta) y `tests/fixtures/aspire_sample.crv3d` (real, 60KB; tests con `.crv3d` se skipean si no existe).
- **TestClient FastAPI** se usa en todos los tests de import; cuidado al asertar status — body en `r.text`.

---

## ESTADO ACTUAL (2026-04-25)

- Pipeline paramétrico → nesting → costing → DXF: **estable**
- API REST + persistencia SQLite (importados) + JSON (proyectos/retazos/config): **estable**
- UI 8 vistas: Dashboard, Projects, Designer (paramétrico+DXF), Nesting (canvas), Inventory, Costs, Export, Settings
- Designer.tsx: tab "Desde DXF" con drop-zone (`.dxf,.crv3d`), grid `FurnitureCard`, modal preview SVG vectorial, modal `.crv3d` con metadata + GIF, wizard de roles con profundidad por layer (`Z=X mm`)
- `.crv3d` (Vectric Aspire nativo): reconocido vía OLE2/`olefile`; extrae versión, dimensiones placa, layer names, GIF preview embebido. Stream `VectorData/2dDataV2` (CArchive propietario) NO parseable → 422 con instrucción de export DXF
- Build .exe operativo (`m_m_optimizer.spec` + `launcher.py`)

---

## ROADMAP

| Prior | Tarea | Archivo principal |
|---|---|---|
| ~~P1~~ | ~~Pipeline + nesting + costing + DXF + persistencia~~ | ✅ |
| ~~P2~~ | ~~Import DXF Aspire + UI tab + wizard roles + preview SVG~~ | ✅ |
| ~~P2~~ | ~~Soporte `.crv3d` (compatibility layer + modal con metadata + GIF)~~ | ✅ |
| ~~P3~~ | ~~`DXF_Z` profundidad por layer en `RoleWizardModal`~~ | ✅ |
| P4 | Override editable de profundidad por layer (hoy es read-only) | `RoleWizardModal.tsx` + nuevo `PUT /api/furniture/{id}/layer_depths` |
| P4 | Persistir `layer_depths` overrides en DB (nueva columna JSON en `ImportedFurniture`) | `backend/app/db.py` |
| P5 | Nesting no-rectangular: `pynest2d`/`nest2D` no en PyPI Win/Py3.11. Opciones: build pynest2d desde fuentes (Boost+libnest2d), NFP propio con Shapely, bbox rotado mínimo. `svgnest` PyPI es solo wrapper de `rectpack` (NO usar) | `nesting/optimizer.py` |
| P5 | Migrar offcut JSON keys español → inglés (breaking — requiere migración) | `nesting/inventory.py` |
| Backlog | Vitest para `nestingUtils.ts` y componentes UI | `ui/` |
| Backlog | Reemplazar `prompt()` en `Export.tsx::onSave` por modal de naming | `Export.tsx` |
| Backlog | Dashboard: gráficos de tendencia (placeholder hoy) | `Dashboard.tsx` |
