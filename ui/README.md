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
  store/        projectStore, themeStore (zustand)
  lib/          api.ts (fetch client), types.ts (espejo de schemas.py)
  styles/       tokens.css (light/dark), globals.css
  router.tsx    react-router-dom
```

## Flujo mínimo funcional

1. Ir a **Diseñador** (rail izquierdo).
2. Ajustar dims → `Optimizar`.
3. Redirige a **Nesting** con layout renderizado en Konva.
4. Ver costos en **Costos**, exportar DXF en **Exportar**.
