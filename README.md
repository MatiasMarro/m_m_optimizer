# m_m optimizer — CNC Nesting Automation

Capa inteligente sobre Mach3 + Vectric Aspire para automatizar nesting 2D, cálculo de costos y generación de G-code.

**Estado:** Humo funcional (backend + UI básica).

## Quick Start

### Windows

#### Opción 1: Automático (recomendado)
1. **Doble click `run.bat`**
2. Espera a que se levante el backend
3. El navegador se abre automáticamente en http://localhost:5173

Si falla, intenta Opción 2.

#### Opción 2: Con diagnostics
1. **Doble click `check.bat`** — verifica Python + Node
2. Si todo OK → **Doble click `run_debug.bat`** para ver errores
3. Pegame el error si persiste

### Mac / Linux
```bash
# Terminal 1: Backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api.server:app --reload --port 8000

# Terminal 2: Frontend
cd ui && npm install && npm run dev
```

Luego abre **http://localhost:5173**

## Docs

- **[SETUP.md](./SETUP.md)** — instrucciones detalladas de instalación y troubleshooting
- **[CLAUDE.md](./CLAUDE.md)** — arquitectura del proyecto, estado actual, pendientes
- **[docs/lepton.md](./docs/lepton.md)** — referencia de funcionalidades Lepton Optimizer

## Stack

### Backend
- **Python 3.11+** · FastAPI · Pydantic
- **nesting/** — optimizador 2D (rectpack MaxRectsBssf)
- **parametric/** — generador de piezas (Cabinet, ShelvingUnit)
- **costing/** — cálculo de costos ARS
- **api/** — REST wrapper

### Frontend
- **React 18** · TypeScript · Vite
- **Tailwind CSS** · Lucide icons
- **Konva** (react-konva) — canvas 2D con drag & drop (WIP)
- **zustand** — state management

## Flujo actual

```
Diseño paramétrico → Piezas → Nesting → Costos → Exportar DXF
```

1. **Diseñador**: Cabinet/ShelvingUnit con dims
2. **Nesting**: optimización 2D en placas, gestión de retazos
3. **Costos**: breakdown material, tapacanto, CNC, MO, herrajes
4. **Exportar**: DXF compatible con Aspire (capas: PIEZAS, ETIQUETAS, RETAZOS)

## Próximos pasos

- [ ] Drag & drop de piezas en canvas
- [ ] DXF Importer (formas arbitrarias)
- [ ] Editor de tarifas (UI Settings → costing config)
- [ ] Persistencia de proyectos (DB básica)
- [ ] Nesting no-rectangular (pynest2d)

## Contacto

m.m.caseros.386@gmail.com
