# Copyright (c) 2024-2026 Matías Marro. All rights reserved.
# m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
"""Launcher para el ejecutable .exe de m_m_optimizer-cnc.

Cuando PyInstaller empaqueta el proyecto, este script es el entry point:
  1. Resuelve las rutas correctas dentro del bundle (_MEIPASS).
  2. Arranca uvicorn en un hilo demonio en un puerto libre.
  3. Abre el navegador apuntando a http://localhost:<puerto>.
  4. Mantiene el proceso vivo hasta que el usuario cierre la ventana.

En desarrollo (python launcher.py) hace exactamente lo mismo, útil para
probar el comportamiento del exe antes de empaquetar.
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path


# ---------------------------------------------------------------------------
# Resolver base_dir: dentro del .exe es sys._MEIPASS, en dev es la raíz.
# ---------------------------------------------------------------------------
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    # Cuando se instala vía Inno Setup en Program Files, ese directorio es de
    # solo lectura. Los datos mutables (proyectos, config, retazos) van a
    # %APPDATA%\m_m_optimizer-cnc\data\ donde el usuario siempre tiene permiso.
    _appdata = os.environ.get("APPDATA") or str(Path.home())
    DATA_DIR = Path(_appdata) / "m_m_optimizer-cnc" / "data"
else:
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / "data"

# Asegurar que data/ y sus subdirectorios existen
DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "projects").mkdir(parents=True, exist_ok=True)

# Poner BASE_DIR en sys.path para que los imports del paquete funcionen
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Sobreescribir variable de entorno para que server.py use el DATA_DIR correcto
os.environ["MM_DATA_DIR"] = str(DATA_DIR)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def _find_free_port(start: int = 8765) -> int:
    """Busca el primer puerto TCP libre a partir de `start`."""
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No se encontró un puerto libre en el rango 8765-8865")


def _wait_for_server(port: int, timeout: float = 10.0) -> bool:
    """Espera hasta que el servidor acepte conexiones TCP."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.2)
            try:
                s.connect(("127.0.0.1", port))
                return True
            except OSError:
                time.sleep(0.1)
    return False


# ---------------------------------------------------------------------------
# Arranque del servidor
# ---------------------------------------------------------------------------
def _start_server(port: int) -> None:
    import uvicorn
    from api.server import app  # noqa: PLC0415

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


def main() -> None:
    port = _find_free_port()
    url = f"http://127.0.0.1:{port}"

    print(f"m_m_optimizer-cnc  —  iniciando en {url} …")

    # Hilo demonio: si el proceso principal termina, el servidor también.
    server_thread = threading.Thread(target=_start_server, args=(port,), daemon=True)
    server_thread.start()

    # Esperar a que uvicorn esté listo antes de abrir el browser
    if _wait_for_server(port):
        webbrowser.open(url)
    else:
        print("ADVERTENCIA: el servidor tardó demasiado en arrancar.")
        webbrowser.open(url)

    print(f"Aplicación corriendo en {url}")
    print("Cerrá esta ventana para detener el servidor.")

    # Mantener el proceso vivo
    try:
        server_thread.join()
    except KeyboardInterrupt:
        print("\nDeteniendo…")


if __name__ == "__main__":
    main()
