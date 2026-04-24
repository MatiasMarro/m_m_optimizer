# Copyright (c) 2024-2026 Matías Marro. All rights reserved.
# m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
#
# PyInstaller spec para empaquetar m_m_optimizer-cnc en un .exe de Windows.
#
# USO:
#   1. Compilar el frontend primero:
#        cd ui && npm run build
#   2. Luego desde la raíz del repo (con venv activo):
#        pyinstaller m_m_optimizer.spec
#   3. El ejecutable queda en:  dist/m_m_optimizer/m_m_optimizer.exe
#
# NOTAS:
#   - ui/dist/ se incluye dentro del bundle (archivos estáticos de React).
#   - data/ NO se incluye: es mutable (proyectos, config, retazos).
#     Se crea automáticamente junto al .exe en el primer arranque (ver launcher.py).
#   - Para redistribuir: copiar toda la carpeta dist/m_m_optimizer/.

import sys
from pathlib import Path

ROOT = Path(SPECPATH)  # noqa: F821  — variable inyectada por PyInstaller

# ---------------------------------------------------------------------------
# Datos estáticos a incluir en el bundle
# Formato: (origen, destino_dentro_del_bundle)
# ---------------------------------------------------------------------------
added_datas = [
    # Build de React (generado por `npm run build`)
    (str(ROOT / "ui" / "dist"), "ui/dist"),
]

# ---------------------------------------------------------------------------
# Análisis de imports
# ---------------------------------------------------------------------------
a = Analysis(  # noqa: F821
    scripts=[str(ROOT / "launcher.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=added_datas,
    hiddenimports=[
        # uvicorn y sus dependencias no siempre se detectan automáticamente
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # FastAPI / Starlette
        "fastapi",
        "starlette",
        "starlette.staticfiles",
        "starlette.responses",
        # Pydantic v2
        "pydantic",
        "pydantic_core",
        # Módulos del proyecto
        "api",
        "api.server",
        "api.schemas",
        "costing",
        "costing.calculator",
        "costing.config",
        "costing.models",
        "nesting",
        "nesting.optimizer",
        "nesting.exporter",
        "nesting.inventory",
        "nesting.models",
        "nesting.config",
        "parametric",
        "parametric.cabinet",
        "parametric.shelving",
        "parametric.base",
        "parametric.holes",
        # Librerías científicas
        "rectpack",
        "ezdxf",
        "anyio",
        "anyio._backends._asyncio",
        "click",
        "h11",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Excluir módulos pesados que no se usan
        "tkinter",
        "matplotlib",
        "numpy",
        "pandas",
        "scipy",
        "PIL",
        "cv2",
        "IPython",
        "jupyter",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="m_m_optimizer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # True = muestra consola (útil para errores); cambiar a False para ocultar
    icon=None,      # Reemplazar con ruta a .ico si se tiene: str(ROOT / "assets" / "icon.ico")
)

coll = COLLECT(  # noqa: F821
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="m_m_optimizer",
)
