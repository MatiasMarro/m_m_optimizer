@echo off
setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo   m_m optimizer CNC - Startup
echo ========================================
echo.

echo [*] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no encontrado. Descargalo de:
    echo https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [OK] Python found

echo [*] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Descargalo de:
    echo https://nodejs.org/ (LTS)
    pause
    exit /b 1
)
echo [OK] Node.js found

echo.
echo [*] Preparando entorno...

if not exist "venv" (
    echo [*] Creando virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo [*] Instalando dependencias Python...
pip install -q fastapi uvicorn pydantic rectpack ezdxf

echo [*] Instalando dependencias Node...
if not exist "ui\node_modules" (
    cd ui
    npm install -q
    cd ..
)

echo.
echo ========================================
echo   Iniciando servidores...
echo ========================================
echo.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo.
echo Se abriran dos ventanas de consola.
echo Cierra ambas para detener.
echo.
pause

start "Backend" cmd /k "venv\Scripts\activate.bat && uvicorn api.server:app --reload --port 8000"
timeout /t 2 /nobreak >nul
start "Frontend" cmd /k "cd ui && npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo [OK] Servidores iniciados
pause
