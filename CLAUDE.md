# m_m_optimizer-cnc

Optimizador CNC para carpintería: diseño paramétrico → nesting 2D → costos → DXF para Mach3/Vectric Aspire. Importa muebles desde DXF/`.crv3d` de Aspire.

**Stack:** Python 3.11 · FastAPI · Pydantic v2 · SQLAlchemy 2.0 · SQLite · `rectpack` · `ezdxf` · `olefile` · `anthropic` · matplotlib · Pillow · React 18 · TypeScript · Vite · Konva · zustand · Tailwind · React Router.

**Deploy:** dev (uvicorn :8000 + Vite :5173) o `.exe` PyInstaller (`launcher.py` + `ui/dist` + datos en `%APPDATA%`).

---

## ARQUITECTURA

```
parametric/ | dxf/parser.py | crv_parser.py
               ↓ pieces[Piece+Hole[]]
    nesting/optimizer.py (2-fase grain, MaxRectsBssf, kerf)
    costing/calculator.py (material+tapacanto+CNC+MO+herrajes+margen)
               ↓
    nesting/exporter.py → DXF (CONTORNO_PLACA, PIEZAS, ETIQUETAS, RETAZOS, TALADRO_*, MARCA_CANTO)
```

`main.run_pipeline(furniture, *, standard_sheet, use_inventory, horas_mo, herrajes, edging_policy, dxf_path) → ProjectResult` — ORQUESTADOR ÚNICO.
`main.run_pipeline_from_pieces(pieces, ...)` — para muebles importados (sin Furniture).
CLI y `api/server.py::POST /pipeline/run` son thin wrappers.

---

## MÓDULOS CLAVE

| Path | Responsabilidad |
|---|---|
| `main.py` | `run_pipeline` + `run_pipeline_from_pieces` + CLI + `apply_edging_policy()` (DEFAULT_EDGING: `name→(top,right,bottom,left)`) |
| `parametric/base.py` | `Furniture` ABC · `MDF_THICKNESS=18` · `BACK_INSET=10` · `SHELF_INSET=2` · `__post_init__` valida dims |
| `parametric/{cabinet,shelving}.py` | Generan `[Piece]` + holes vía `junction_face_holes`/`junction_edge_holes` |
| `parametric/holes.py` | Sistema 32 (`SYS32_OFFSET=37`) · `HardwareConfig` · builders de `Hole` |
| `nesting/models.py` | `Piece`,`Sheet`,`PlacedPiece`,`SheetUsage`,`Layout`,`Hole`,`HoleType`,`Face`,`rotate_hole_cw()` · coords inf-izq |
| `nesting/optimizer.py` | F1: grain_locked sin rot; F2: free_rects de F1 como sub-bins virtuales con rot. Merge reubica en placa padre con offset |
| `nesting/inventory.py` | `OffcutInventory` JSON · keys ESPAÑOL (`ancho`,`alto`,`usado`) · `MIN_OFFCUT_SIDE=200mm` |
| `nesting/exporter.py` | `DXFExporter.export(layout, path)` · `GAP=200mm` entre placas |
| `nesting/config.py` | `KERF=3` · `STANDARD_SHEET_W/H=1830/2440` · `MIN_OFFCUT_SIDE=200` · `INVENTORY_PATH` |
| `costing/calculator.py` | `CostCalculator.compute()` · kerf-aware perimeter merging · adyacencia exacta→resta overlap |
| `costing/models.py` | `CostBreakdown` (material→subtotal→total) · `HardwareItem` · `pretty()` CLI |
| `costing/config.py` | Tarifas ARS por defecto · override vía `data/config.json` |
| `api/server.py` | FastAPI · CORS `:5173` · monta `furniture_router` · `init_db()` · SPA fallback · `_serialize()` Layout/Cost→DTO |
| `api/schemas.py` | Pydantic v2 — fuente de verdad. TS regenera con `npm run gen:types`. **NO editar** `openapi.generated.ts` |
| `backend/app/db.py` | SQLAlchemy 2.0 · `ImportedFurniture`+`ImportedPiece` · respeta `MM_DATA_DIR` env |
| `backend/app/dxf/parser.py` | `parse_aspire_dxf(path,thickness)→ParseResult` · clasifica layer por regex · extrae `text_annotations[]` de TEXT/MTEXT/DIMENSION · `detect_quality_issues()` post-parse |
| `backend/app/dxf/crv_parser.py` | `parse_aspire_crv3d_metadata(path)→Crv3dMetadata` + `extract_preview_gif()` · OLE2/olefile · NO parsea contornos (CArchive propietario) |
| `backend/app/repositories/furniture_repo.py` | session-per-operation (NO cachea SessionLocal → monkeypatcheable) · CRUD + `upsert_pieces` + `update_piece_roles` |
| `backend/app/ai/claude_analyzer.py` | `ClaudeAnalyzer.suggest_roles(...)` · Claude Opus 4.7 · tool use `strict:true` · prompt caching · API key: param > env `ANTHROPIC_API_KEY` > `data/config.json` · `text_annotations` cap 30 |
| `backend/app/routers/furniture_import.py` | `/api/furniture/*` · acepta `.dxf`/`.crv3d` · `.crv3d`→422+metadata+GIF · thumbnail JPEG 200×200 · `_compute_layer_depths` mediana · `_build_pieces_from_imported` agrupa PROFILE por (role\|layer,w,h)±1mm · `_GRAIN_LOCKED_ROLES={"lateral"}` |
| `launcher.py` | .exe entry: puerto libre 8765+, hilo uvicorn, abre browser · `MM_DATA_DIR=%APPDATA%/m_m_optimizer-cnc/data` |
| `ui/src/router.tsx` | 8 rutas: `/`,`/projects`,`/designer`,`/nesting`,`/inventory`,`/costs`,`/export`,`/settings` · Layout: `AppShell` (TopBar+RailNav+StatusBar+Outlet) |
| `ui/src/store/projectStore.ts` | zustand · `spec`,`result`,`inventoryComparison`,`movePiece`(recomputa efficiency) · `activeProjectName` (string\|null, nombre del proyecto en curso) |
| `ui/src/store/themeStore.ts` | light/dark · `localStorage["mm:theme"]` · toggle `<html class="dark">` |
| `ui/src/lib/api.ts` | `req<T>()` JSON · `importFurniture` multipart · detecta `Crv3dNotSupportedError` (422) · lanza Error 4xx/5xx con body |
| `ui/src/lib/nestingUtils.ts` | `snapToKerf`,`clampToSheet`,`piecesCollide`,`applyDragSnap`,`findNearestValidPosition`,`resolveDropPosition` |
| `ui/src/lib/useTokenColors.ts` | Devuelve hex resolved según tema activo (para Konva, que no lee CSS vars) |
| `ui/src/views/Designer.tsx` | Tabs: Paramétrico / Desde DXF · drop-zone `.dxf,.crv3d` · grid FurnitureCard · modal DxfPreview SVG · modal crv3d+GIF · RoleWizardModal |
| `ui/src/views/Nesting.tsx` | `NestingCanvas` Konva + `InspectorPanel` · kerf de `/config/costing` · banner verde `inventoryComparison` · botones "→ Ver costos" y "→ Exportar" al pie |
| `ui/src/views/Costs.tsx` | Breakdown de `projectStore.result.costo` · empty state con CTA a Designer |
| `ui/src/views/Export.tsx` | Exportar DXF (genera `output/nesting.dxf` en servidor) + modal guardar proyecto · empty state con CTA |
| `ui/src/views/Inventory.tsx` | Grid retazos · SVG proporcional · formulario añadir retazo manual (ancho+alto) · `POST /inventory/offcuts` |
| `ui/src/views/Projects.tsx` | Lista proyectos · abrir→store→navigate `/nesting` · modal confirm borrar (NO `window.confirm`) |
| `ui/src/views/Dashboard.tsx` | 4 KpiCard dinámicos · tendencias placeholder |
| `ui/src/views/Settings.tsx` | Costing config + AI key (masked) · margen ×100 en UI, ratio 0..1 en API |
| `ui/src/components/canvas/NestingCanvas.tsx` | Stage Konva forwardRef · zoom+fit · drag snap+collision · hover info |
| `ui/src/components/DxfPreview.tsx` | SVG vectorial: bbox+flip-Y, polygon/polyline, color por categoría layer · `vector-effect: non-scaling-stroke` |
| `ui/src/components/RoleWizardModal.tsx` | Portal · rol por layer · `Z=X mm` depth · `ROLE_OPTIONS` exportado · botón "Sugerir con IA" |
| `ui/src/components/layout/WorkflowBar.tsx` | Barra de progreso de flujo activo: "Diseñar→Nesting→Costos→Exportar" · visible en TopBar cuando `activeProjectName != null` |

---

## ENTIDADES

**Backend:**
- `Piece`: name, width, height, qty, grain_locked, edged(top,right,bottom,left), holes[]
- `Hole`: x, y, diameter, depth(-1=pasante), type:HoleType, face:Face=FACE_UP
- `HoleType`: TARUGO | MINIFIX_CARCASA | MINIFIX_PERNO | TORNILLO
- `Face`: FACE_UP/DOWN | EDGE_LEFT/RIGHT/BOTTOM/TOP
- `Sheet`: id, width, height, thickness=18, is_offcut=False
- `PlacedPiece`: piece_name, sheet_id, x, y, width, height, rotated, holes[]
- `Layout`: sheets_used[], unplaced[], efficiency, new_offcuts[]
- `CostBreakdown`: material_placas, material_retazos, tapacanto, tiempo_cnc, mano_obra, herrajes, margen → subtotal, total
- `ImportedFurniture` (DB): id(UUID), name, dxf_path, material_thickness, parsed_data(JSON), piece_roles(JSON), thumbnail_path, created_at, updated_at
- `ImportedPiece` (DB): id, furniture_id, layer, role, vertices(JSON), width, height, depth, quantity
- `ParseResult`: contours[], layer_summary{}, warnings[], text_annotations[TextAnnotation]
- `TextAnnotation`: layer, text, x, y, height, kind("text"|"mtext"|"dimension")
- `Crv3dMetadata`: aspire_version, material_{width,height,thickness}_mm, layer_names[], has_preview_gif
- `OperationType`: PROFILE(Z≈thickness) | POCKET(0<Z<thickness) | DRILL | GROOVE | REFERENCE

**Frontend (TS):**
- `FurnitureSpec`: tipo("cabinet"|"shelving"), ancho, alto, profundidad, espesor=18, num_estantes=1, con_fondo=true
- `FurnitureItem`: furniture_id, name, thumbnail_url, contours_count, layers[], layer_depths{layer:mm}, piece_roles{}, created_at
- `FurnitureDetail`: extends FurnitureItem + material_thickness + pieces[FurniturePiece]
- `InventoryComparison`: fileName, sheetsWithout, sheetsWith, offcutsUsed, savingsArs, savingsPct
- `Crv3dNotSupportedError`: clase JS · `.metadata` + `.previewGifBase64`
- `NestingCanvasHandle`: zoomIn(), zoomOut(), fit() — forwardRef API
- `TokenColors`: bg, surface, surface2, border, primary, accent, danger, text, textMuted, pieceGrain, pieceFree, offcut

---

## API REST (`:8000`)

> Proxy Vite: `/api/furniture/*` → passthrough al backend. Resto de `/api/*` → strip `/api` → backend sin prefijo.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | liveness |
| POST | `/pipeline/run` | `PipelineRequest→PipelineResponse` |
| GET | `/inventory/offcuts` | lista retazos |
| POST | `/inventory/offcuts` | añadir retazo manual `{ancho,alto}` |
| GET/PUT | `/config/costing` | tarifas ↔ config.json (margen ratio 0..1, PUT preserva anthropic_api_key) |
| GET | `/config/ai` | `{has_anthropic_api_key, masked_key, model}` — nunca key en plano |
| PUT | `/config/ai` | `{anthropic_api_key:str|null}` — null/""→borra del config |
| POST/GET | `/projects` | guardar / listar `ProjectMeta[]` desc por created_at |
| GET/DELETE | `/projects/{id}` | `SavedProject` completo / borrar archivo |
| POST | `/api/furniture/import` | multipart(name,material_thickness,dxf_file) · crv3d→422+metadata+gif |
| GET | `/api/furniture` | `FurnitureItem[]` con layer_depths |
| GET/DELETE | `/api/furniture/{id}` | detalle+pieces / borra DB+dir |
| GET | `/api/furniture/{id}/thumbnail` | JPEG 200×200 |
| PUT | `/api/furniture/{id}/roles` | `{roles:{layer:role}}` |
| POST | `/api/furniture/{id}/optimize` | `{use_inventory?,compare_inventory?}` → pipeline; compare→doble run+summary |
| POST | `/api/furniture/{id}/suggest-roles` | Claude Opus 4.7 → `{suggestions:{layer:role}}` · 422 sin key |

---

## ALMACENAMIENTO

| Path | Contenido |
|---|---|
| `data/config.json` | Tarifas costing + anthropic_api_key |
| `data/offcuts.json` | Retazos: keys español (`ancho`,`alto`,`usado`) |
| `data/projects/{id}.json` | `SavedProject` completo |
| `data/furniture.db` | SQLite: `imported_furniture` + `imported_pieces` |
| `data/furniture/{id}/` | `original.dxf/.crv3d` + `thumb.jpg` + `ref_NN.*` |

---

## CONFIGURACIÓN

Sin `.env`. Defaults en `costing/config.py` + `nesting/config.py`. Override en `data/config.json`.

| Clave | Default |
|---|---|
| `precio_placa_mdf18` | 45000 ARS |
| `factor_valor_retazo` | 0.5 |
| `precio_tapacanto_m` | 800 |
| `costo_hora_cnc` | 8000 |
| `velocidad_corte_mm_min` | 3000 |
| `costo_hora_mo` | 3500 |
| `horas_mo_default` | 4.0 |
| `margen` | 0.40 (UI×100=40%) |
| `kerf_mm` | 3.0 |
| `STANDARD_SHEET_W/H` | 1830×2440 (no editable) |
| `MIN_OFFCUT_SIDE` | 200mm (no editable) |

---

## CONVENCIONES

- **Coords:** origen inferior-izquierdo en TODO. SVG: `transform="scale(1,-1)"` para flip-Y.
- **Idioma:** dominio en español (names: "lateral","tapa","fondo"; offcut JSON keys: español). UI en español. Código español/inglés mixto.
- **Tipos:** `api/schemas.py` (Pydantic v2) es la fuente de verdad. `npm run gen:types` regenera TS.
- **Modales:** patrón — `createPortal` a `document.body` · backdrop `fixed inset-0 z-50 bg-black/50 backdrop-blur-sm` · `role="dialog" aria-modal` · ESC cierra · click fuera cierra.
- **HTTP errors:** 400 input inválido · 422 reglas negocio · 404 not found · 500 DB.
- **Naming:** `snake_case` Python · `camelCase` TS.
- **Theming:** Tailwind CSS vars (`var(--primary)` etc.) en `globals.css`. Para Konva: `useTokenColors()`.

---

## GOTCHAS — LEER ANTES DE MODIFICAR

1. **Vite proxy doble regla**: `/api/furniture/*` passthrough (backend tiene prefix `/api/furniture`); resto de `/api/*` strip-ea `/api` (backend NO usa prefix para `/pipeline/run`, `/inventory/*`, `/projects`, `/config/*`).
2. **KERF se SUMA** a dimensiones antes de `rectpack` (`p.width+kerf`). Al desempacar se resta. Adyacencia exacta a kerf → corte compartido (costing resta overlap).
3. **2-fase grain**: F1 grain_locked sin rot → `free_rects` → bins virtuales `V::sheet_id::i` para F2 (con rot). Merge reubica placements virtuales en placa padre con offset.
4. **`MIN_OFFCUT_SIDE=200mm`**: retazos con lado <200 NO se persisten (descarte silencioso).
5. **`MM_DATA_DIR` env**: `db.py` y `api/server.py` lo respetan. En tests no se setea → usa `data/` del repo.
6. **`DATA_DIR` en `furniture_import.py`** hardcodeado a `parents[3]/data` — NO respeta `MM_DATA_DIR`. Tests lo aíslan con `monkeypatch.setattr(fi_mod, "FURNITURE_DIR", ...)`.
7. **`furniture_repo._session()`** resuelve `db_module.SessionLocal` cada llamada (no cachea) → tests pueden monkeypatch-ear con SQLite in-memory + StaticPool.
8. **`apply_edging_policy`** matchea por `Piece.name` (no por role). Roles solo aplican a piezas importadas.
9. **`.crv3d`**: `parse_aspire_crv3d()` SIEMPRE lanza `Crv3dExportRequiredError` (CArchive propietario ilegible). Solo `parse_aspire_crv3d_metadata()` extrae datos reales.
10. **Margen UI vs API**: UI muestra ×100 (%). Backend recibe/guarda ratio 0..1. Conversión en `Settings.tsx::save` y `useEffect`.
11. **DXF output**: backend genera `output/nesting.dxf` (path hardcodeado en `api/server.py`). Frontend sirve descarga vía `GET /output/nesting.dxf`.
12. **Theme dark**: clase en `<html>`, `localStorage["mm:theme"]`, aplicada eagerly en import de `themeStore.ts`.
13. **`ezdxf` rendering** (thumbnail): requiere matplotlib `Agg` — se setea al import de `furniture_import.py`. NO importar matplotlib antes.
14. **`init_db()` se llama dos veces** (idempotente). Cuidado con migraciones futuras.
15. **Vite cacheDir**: `os.tmpdir()/vite-m_m_optimizer` — NO en `node_modules/.vite` (conflicts Windows).

---

## COMANDOS

```bash
# Dev
uvicorn api.server:app --reload --port 8000   # backend
cd ui && npm run dev                          # frontend :5173
# Windows: doble-click run.bat

# Tests & check
venv\Scripts\python.exe -m pytest tests/ -v  # 120/120
cd ui && npx tsc --noEmit                    # TS typecheck
cd ui && npm run gen:types                   # regen TS (requiere backend up)

# Build .exe
cd ui && npm run build
pyinstaller m_m_optimizer.spec
```

---

## TESTING

- **pytest 120/120** (2026-04-25). UI: solo `tsc --noEmit`.
- **Aislamiento global**: `conftest.py::_isolate_inventory_cwd` → `monkeypatch.chdir(tmp_path)`.
- **DB isolation**:
  ```python
  eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
  monkeypatch.setattr(db_module, "engine", eng)
  monkeypatch.setattr(db_module, "SessionLocal", sessionmaker(bind=eng))
  db_module.Base.metadata.create_all(eng)
  ```
- **Furniture dir**: `monkeypatch.setattr(fi_mod, "FURNITURE_DIR", tmp_path / "furniture")`.
- **Fixtures**: `tests/fixtures/aspire_sample.dxf` (auto-generado) · `aspire_sample.crv3d` (60KB real, tests se skipean si falta).
- **TestClient FastAPI**: cuidado al asertar status — body en `r.text`.

---

## ESTADO ACTUAL (2026-04-25)

**Estable y funcionando:**
- Pipeline paramétrico → nesting → costing → DXF export
- API REST + SQLite (importados) + JSON (proyectos/retazos/config)
- UI 8 vistas · Designer con tab DXF+crv3d+wizard roles+preview SVG
- FurnitureCard "Optimizar mueble" → `POST /api/furniture/{id}/optimize` (compare_inventory) → banner ahorro en Nesting
- IA (Claude Opus 4.7) sugiere roles · Settings UI con masked API key
- TEXT/MTEXT/DIMENSION del DXF como `text_annotations[]` → contexto IA
- Build .exe operativo

**UX/flujo activo (en implementación):**
- `projectStore.activeProjectName` — nombre del proyecto en curso
- `WorkflowBar` en TopBar — barra de progreso "Diseñar→Nesting→Costos→Exportar"
- Navigation guard — confirmación al abandonar flujo con resultado activo
- Empty states con CTA en Costs/Export/Nesting cuando no hay resultado
- Auto-navigate a /nesting tras optimizar
- Inventory: formulario añadir retazo manual + `POST /inventory/offcuts`
- Projects: modal confirm borrar (reemplaza `window.confirm`)
- Export: `GET /output/nesting.dxf` para descarga real del archivo

---

## ROADMAP

| Prior | Tarea | Archivo |
|---|---|---|
| **P1** | `WorkflowBar`: barra progreso en TopBar (activeProjectName→steps) | `TopBar.tsx` + nuevo `WorkflowBar.tsx` |
| **P1** | Navigation guard: confirm modal al salir flujo activo | `AppShell.tsx` + `projectStore.ts` |
| **P1** | Empty states con CTA en Costs/Export/Nesting | `Costs.tsx`,`Export.tsx`,`Nesting.tsx` |
| **P1** | Auto-navigate `/nesting` tras `runPipeline` y tras `optimize` de FurnitureCard | `Designer.tsx`,`Designer.tsx` FurnitureCard |
| **P2** | `POST /inventory/offcuts` + formulario UI en Inventory | `api/server.py` + `Inventory.tsx` |
| **P2** | `GET /output/nesting.dxf` → descarga real desde Export | `api/server.py` + `Export.tsx` |
| **P2** | `window.confirm` → modal portal en Projects | `Projects.tsx` |
| P3 | Override editable de profundidad por layer | `RoleWizardModal.tsx` + `PUT /api/furniture/{id}/layer_depths` + columna JSON en `ImportedFurniture` |
| P4 | Nesting no-rectangular (pynest2d/Shapely NFP) | `nesting/optimizer.py` |
| Backlog | Dashboard: gráficos de tendencia reales | `Dashboard.tsx` |
| Backlog | Vitest para `nestingUtils.ts` y componentes UI | `ui/` |
