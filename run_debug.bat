@echo off
setlocal enabledelayedexpansion

title m_m optimizer - Debug Mode

echo.
echo Debug Mode - Mostrando todos los detalles
echo.

echo === Python ===
python --version
echo.

echo === Node ===
node --version
echo.

echo === Creando venv ===
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate.bat

echo.
echo === Instalando dependencias Python ===
pip install -r requirements.txt

echo.
echo === Instalando dependencias Node ===
if not exist ui\node_modules (
    cd ui
    npm install
    cd ..
)

echo.
echo === Iniciando Backend ===
start cmd /k "venv\Scripts\activate.bat && uvicorn api.server:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo === Iniciando Frontend ===
start cmd /k "cd ui && npm run dev"

timeout /t 2 /nobreak >nul

echo.
echo Abriendo navegador en http://localhost:5173...
start http://localhost:5173

echo.
pause
