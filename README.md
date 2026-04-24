# 🪵 m_m_optimizer

> **CNC Nesting Optimizer for Woodworking** — Automated 2D layout optimization, cost calculation, and DXF export for Mach3 + Vectric Aspire

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.11x-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-All%20rights%20reserved-lightgrey)

---

## Overview

**m_m_optimizer** is an intelligent automation layer on top of Mach3 + Vectric Aspire that transforms furniture dimensions into optimized CNC-ready files in seconds. Define a cabinet or shelving unit, and the system automatically generates all pieces, nests them onto sheets, calculates full job costs, and exports a DXF ready to load in Aspire — no manual layout work required.

It solves a real workshop problem: manually arranging pieces on MDF sheets wastes material, takes time, and makes cost estimation error-prone. m_m_optimizer automates the entire pipeline from parametric design to DXF export, with a React UI for interactive adjustments and a full REST API for integration.

---

## Features

- ✨ **Parametric furniture design** — Cabinet and ShelvingUnit generators with configurable dimensions
- 📐 **2D nesting optimization** — MaxRects BSSF algorithm via `rectpack` for maximum material efficiency
- 💰 **Automatic cost breakdown** — Materials, edge banding, CNC time, labor, hardware, and margin
- ♻️ **Offcut inventory management** — Tracks reusable remnants and feeds them back into future jobs
- 📤 **DXF export for Aspire** — Organized layers: `PIEZAS`, `ETIQUETAS`, `RETAZOS`
- 🎨 **Interactive React UI** — Canvas with drag & drop, zoom/pan, and live efficiency preview
- ⚙️ **Configurable pricing** — Edit rates from the Settings UI; persisted in `data/config.json`
- 💾 **Project persistence** — Save and reload full project snapshots

---

## Tech Stack

**Backend:**
- Python 3.11+ · FastAPI · Pydantic v2
- `rectpack` — 2D nesting engine
- `ezdxf` — DXF generation

**Frontend:**
- React 18 · TypeScript · Vite
- Tailwind CSS · Lucide icons
- Konva — interactive 2D canvas
- zustand — state management

---

## Quick Start

**Windows (Automated):**
```bash
# Double-click run.bat — backend starts and browser opens automatically
run.bat
```

**Manual Setup:**
```bash
# Backend
python -m venv venv
venv\Scripts\activate        # or: source venv/bin/activate  (Mac/Linux)
pip install -r requirements.txt
uvicorn api.server:app --reload --port 8000

# Frontend (separate terminal)
cd ui
npm install
npm run dev
```

Then open **http://localhost:5173**

---

## Project Structure

```
m_m_optimizer/
├── parametric/      # Furniture design generators (Cabinet, ShelvingUnit)
├── nesting/         # 2D optimization engine (MaxRects BSSF)
├── costing/         # Cost calculation module
├── api/             # FastAPI REST wrapper
├── ui/              # React + TypeScript frontend
├── data/            # Projects, offcuts inventory, config
├── tests/           # pytest suite (27/27 passing)
└── main.py          # CLI entry point
```

---

## Workflow

```
Parametric Design → Nesting → Cost Calculation → DXF Export
       ↓               ↓             ↓                ↓
    Pieces         Optimized      Breakdown       Aspire-ready
    + Holes          Layout         (ARS)           (layers)
```

---

## API

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/pipeline/run` | Execute the full pipeline |
| `GET` | `/projects` | List saved projects |
| `GET` | `/inventory/offcuts` | List available offcuts |
| `GET/PUT` | `/config/costing` | Manage pricing configuration |

---

## Documentation

- 📖 [SETUP.md](./SETUP.md) — Detailed installation and troubleshooting
- 🏗️ [CLAUDE.md](./CLAUDE.md) — Architecture, current state, and roadmap
- 📚 [docs/lepton.md](./docs/lepton.md) — Lepton Optimizer feature reference

---

## Roadmap

- [ ] DXF Importer (arbitrary shapes)
- [ ] 3D/2D preview in Designer
- [ ] Non-rectangular nesting (`pynest2d`)
- [ ] Database persistence
- [ ] Multi-user support

---

## Contributing

Issues and pull requests are welcome. Feel free to open an issue to discuss a feature or bug before submitting a PR.

---

## License

All rights reserved © Matias Marro

---

## Contact

m.m.caseros.386@gmail.com
