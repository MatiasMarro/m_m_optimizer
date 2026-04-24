# m_m_optimizer · UI

Frontend React + TS + Vite + Tailwind + Konva.

## Arranque

```bash
# 1. Backend (desde la raíz del repo)
pip install -r requirements.txt
uvicorn api.server:app --reload --port 8000

# 2. Frontend (en otra terminal)
cd ui
npm install        # o pnpm / yarn
npm run dev        # http://localhost:5173

# Regenerar tipos TypeScript desde OpenAPI (requiere backend en :8000)
npm run gen:types
```

Vite proxya `/api/*` → `http://localhost:8000`.

## Estructura

```
src/
  components/
    layout/     AppShell, TopBar, RailNav, StatusBar, InspectorPanel
    canvas/     NestingCanvas (react-konva), CanvasToolbar
    ui/         Button, KpiCard
  views/        Dashboard, Projects, Designer, Nesting,
                Inventory, Costs, Export, Settings
  store/        projectStore (zustand, incluye movePiece)
                themeStore (zustand, light/dark)
  lib/          api.ts          — fetch client tipado
                types.ts        — re-exporta openapi.generated.ts
                nestingUtils.ts — helpers puros para drag & drop canvas
                useTokenColors  — colores hex para Konva (CSS vars ≠ Canvas2D)
  styles/       tokens.css (light/dark), globals.css
  router.tsx    react-router-dom
```

## Flujo mínimo funcional

1. Ir a **Diseñador** (rail izquierdo).
2. Ajustar dims → `Optimizar`.
3. Redirige a **Nesting** con layout renderizado en Konva.
4. **Drag & drop** piezas entre placas: snap al kerf, detección de colisiones,
   eficiencia en vivo. El kerf se lee de `GET /config/costing`.
5. Ver costos en **Costos**, exportar DXF en **Exportar**.
6. Kerf y tarifas configurables en **Ajustes** (persiste en `data/config.json`).

## Notas Konva / Canvas

- Las CSS custom properties (`var(--color)`) **no funcionan** en Canvas 2D API.
- Usar siempre `useTokenColors()` que devuelve constantes hex según el tema del store.
- El canvas de Nesting necesita `forwardRef` + `NestingCanvasHandle` para exponer
  `zoomIn()`, `zoomOut()`, `fit()` al toolbar.

---

*m_m_optimizer-cnc © 2024-2026 Matías Marro. All rights reserved.*

