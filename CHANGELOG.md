# Changelog

Todos los cambios notables de este proyecto siguen el formato [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Versiones según [Semantic Versioning](https://semver.org/lang/es/).

---

## [0.3.0] — 2026-04-25

### Added
- **Parser DXF Aspire**: importación completa de archivos `.dxf` generados por Vectric Aspire — clasifica layers por regex, extrae TEXT/MTEXT/DIMENSION como `text_annotations`, detecta problemas de calidad post-parse.
- **Soporte `.crv3d`**: extrae metadatos (versión Aspire, dimensiones, layers) y GIF de preview embebido vía OLE2; los contornos no se parsean (formato CArchive propietario).
- **SQLite para muebles importados**: `ImportedFurniture` + `ImportedPiece` gestionados con SQLAlchemy 2.0. Respeta `MM_DATA_DIR` env.
- **CRUD API muebles importados**: `POST /api/furniture/import`, `GET /api/furniture`, `GET/DELETE /api/furniture/{id}`, thumbnail JPEG 200×200.
- **Wizard de roles por layer** (`RoleWizardModal`): asignar rol (lateral, tapa, fondo, estante…) y profundidad Z a cada layer del DXF. `PUT /api/furniture/{id}/roles`.
- **Preview SVG vectorial** de contornos DXF en Designer: flip-Y, bbox normalizado, color por categoría de layer.
- **Sugerencia de roles con IA** (`Claude Opus 4.7`): `POST /api/furniture/{id}/suggest-roles` — usa `text_annotations` del DXF como contexto, tool use con `strict:true`, prompt caching. Botón "Sugerir con IA" en `RoleWizardModal`.
- **WorkflowBar** en TopBar: muestra "Diseñar → Nesting → Costos → Exportar" con el nombre del proyecto activo cuando hay un resultado en curso.
- **Navigation guard**: modal de confirmación al salir del flujo activo desde RailNav si hay resultado sin guardar.
- **Empty states con CTA** en Nesting, Costs y Export: guía al usuario al paso correcto cuando no hay datos.
- **Auto-navigate a /nesting** tras optimizar (paramétrico y desde FurnitureCard).
- **Botones de continuación** "→ Ver costos" y "→ Exportar" al pie de Nesting.
- **`activeProjectName`** en `projectStore` + `WorkflowBar` reactivo.
- **Descarga DXF real**: `GET /output/nesting.dxf` (FileResponse) — el botón "Exportar DXF" descarga el archivo sin re-correr el pipeline.
- **Formulario "Agregar retazo"** en Inventory: campos ancho/alto (mm) → `POST /inventory/offcuts` → refresh automático de la grilla.
- **`costsMayBeStale` flag** en store: Settings activa el flag al guardar tarifas; Costs muestra banner amarillo "Las tarifas cambiaron — Recalcular"; el flag se resetea cuando el pipeline corre.
- **`setActiveProjectName` al abrir proyecto**: WorkflowBar y navigation guard se activan correctamente al cargar desde Projects.
- **Settings**: sección AI key enmascarada + estado `has_anthropic_api_key`.
- **`GET /config/ai`** y **`PUT /config/ai`**: gestión segura de la API key de Anthropic (nunca en plano en respuestas).

### Changed
- Pipeline paramétrico (`onOptimize`) ahora siempre genera DXF (`export_dxf: true`).
- `CLAUDE.md` optimizado (~40% reducción de tokens) con estructura de tablas compactas.
- `main.py` refactorizado con `run_pipeline_from_pieces` como orquestador para muebles importados.
- `vite.config.ts`: `cacheDir` apunta a `os.tmpdir()` para evitar conflictos en Windows.

### Fixed
- `DATA_DIR` en `furniture_import.py` respeta `MM_DATA_DIR` env en modo `.exe`.
- `furniture_repo._session()` resuelve `SessionLocal` en cada llamada (permite monkeypatch en tests).
- Descarga de DXF ya no re-ejecuta el pipeline completo.

### Tests
- 120 tests — 120/120 passing.
- Suite DXF: `test_parser`, `test_import`, `test_furniture_db`, `test_ai_suggest`, `test_crv_parser`.

---

## [0.2.0] — 2026-03-xx

### Added
- Empaquetado `.exe` con PyInstaller + instalador Inno Setup (`m_m_optimizer.spec`, `installer/`).
- `launcher.py`: entry point del ejecutable, busca puerto libre 8765+, lanza uvicorn en hilo y abre el navegador.
- `MM_DATA_DIR` env: datos en `%APPDATA%/m_m_optimizer-cnc/data` cuando corre como `.exe`.

---

## [0.1.0] — 2026-01-xx

### Added
- Pipeline paramétrico completo: `Cabinet` + `ShelvingUnit` → nesting 2D (2 fases, grain, MaxRectsBssf, kerf) → costing → DXF export.
- API REST FastAPI: `POST /pipeline/run`, `GET/POST /inventory/offcuts`, `GET/PUT /config/costing`, `GET/POST/DELETE /projects`.
- UI React 18 + TypeScript: 8 vistas (Dashboard, Designer, Nesting, Costs, Export, Inventory, Projects, Settings).
- Canvas Konva interactivo con zoom, fit, drag & snap por kerf.
- Inventario de retazos JSON con `OffcutInventory`.
- Proyectos guardados en JSON (`data/projects/`).
- Theming light/dark con CSS vars + Tailwind.
