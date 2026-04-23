@echo off
setlocal

:: Directorio raiz del proyecto (donde esta este bat)
set "ROOT=%~dp0"
:: Quitar barra final
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cls
echo.
echo ========================================
echo   m_m optimizer CNC - Startup
echo ========================================
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no encontrado. Descargalo de https://www.python.org/downloads/
    pause & exit /b 1
)
echo [OK] Python encontrado

:: Verificar Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado. Descargalo de https://nodejs.org/
    pause & exit /b 1
)
echo [OK] Node.js encontrado

:: Crear venv si no existe
if not exist "%ROOT%\venv\Scripts\python.exe" (
    echo [*] Creando virtual environment...
    python -m venv "%ROOT%\venv"
)

:: Instalar deps Python
echo [*] Instalando dependencias Python...
"%ROOT%\venv\Scripts\pip.exe" install -q -r "%ROOT%\requirements.txt"

:: Instalar deps Node
if not exist "%ROOT%\ui\node_modules" (
    echo [*] Instalando dependencias Node...
    cd /d "%ROOT%\ui"
    npm install --silent
    cd /d "%ROOT%"
)

echo.
echo ========================================
echo   Lanzando servidores...
echo ========================================
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://localhost:5173
echo ========================================
echo.

:: Backend en ventana nueva
start "m_m Backend" cmd /k "cd /d "%ROOT%" && "%ROOT%\venv\Scripts\python.exe" -m uvicorn api.server:app --reload --port 8000"

:: Esperar 2 seg y lanzar frontend
timeout /t 2 /nobreak >nul
start "m_m Frontend" cmd /k "cd /d "%ROOT%\ui" && npm run dev"

:: Esperar 4 seg y abrir navegador
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo [OK] Servidores en marcha. Podes cerrar esta ventana.
timeout /t 3 /nobreak >nul
