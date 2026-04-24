@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  m_m_optimizer-cnc - Build Script
::  Genera setup_m_m_optimizer_vX.Y.Z.exe listo para instalar
::  Uso: build_exe.bat [--skip-frontend]
:: ============================================================

:: Colores ANSI (Windows 10+)
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "C_RESET=%ESC%[0m"
set "C_BOLD=%ESC%[1m"
set "C_GREEN=%ESC%[32m"
set "C_YELLOW=%ESC%[33m"
set "C_CYAN=%ESC%[36m"
set "C_RED=%ESC%[31m"
set "C_DIM=%ESC%[2m"

:: Directorio raiz del proyecto (donde vive este .bat)
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

:: Flag opcional
set "SKIP_FRONTEND=0"
if "%1"=="--skip-frontend" set "SKIP_FRONTEND=1"

:: ============================================================
call :banner
call :check_prerequisites
if errorlevel 1 goto :build_failed
call :activate_venv
if errorlevel 1 goto :build_failed
if "%SKIP_FRONTEND%"=="0" (
    call :build_frontend
    if errorlevel 1 goto :build_failed
)
call :install_pyinstaller
if errorlevel 1 goto :build_failed
call :build_exe
if errorlevel 1 goto :build_failed
call :build_installer
if errorlevel 1 goto :build_failed
call :done
goto :eof

:build_failed
echo.
echo %C_BOLD%%C_RED%  El proceso se detuvo por el error de arriba.%C_RESET%
echo.
pause
exit /b 1

:: ============================================================
:banner
echo.
echo %C_BOLD%%C_CYAN%  ================================================%C_RESET%
echo %C_BOLD%%C_CYAN%   m_m_optimizer-cnc  ^|  Build Instalador%C_RESET%
echo %C_BOLD%%C_CYAN%   (c) 2024-2026 Matias Marro%C_RESET%
echo %C_BOLD%%C_CYAN%  ================================================%C_RESET%
echo.
goto :eof

:: ============================================================
:check_prerequisites
call :step "Verificando requisitos previos"

:: Python
python --version >nul 2>&1
if errorlevel 1 (
    call :fail "Python no encontrado en PATH. Instalar desde https://python.org"
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
call :ok "Python: %PY_VER%"

:: Node
node --version >nul 2>&1
if errorlevel 1 (
    call :fail "Node.js no encontrado en PATH. Instalar desde https://nodejs.org (LTS)"
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do set "NODE_VER=%%v"
call :ok "Node.js: %NODE_VER%"

:: npm - usar "where" en lugar de "npm --version" para evitar cuelgues en Windows
where npm >nul 2>&1
if errorlevel 1 (
    call :fail "npm no encontrado. Reinstalar Node.js"
    exit /b 1
)
call :ok "npm: OK"
goto :eof

:: ============================================================
:activate_venv
call :step "Activando entorno virtual"

if exist "%ROOT%\venv\Scripts\activate.bat" (
    call "%ROOT%\venv\Scripts\activate.bat"
    call :ok "venv activado"
) else (
    call :warn "No se encontro venv\. Usando Python global."
    call :warn "Recomendado: python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt"
)
goto :eof

:: ============================================================
:build_frontend
call :step "Compilando frontend React"

if not exist "%ROOT%\ui\package.json" (
    call :fail "No se encontro ui\package.json"
    exit /b 1
)

echo %C_DIM%  -> npm install (dependencias)...%C_RESET%
pushd "%ROOT%\ui"
npm install --silent
if errorlevel 1 (
    popd
    call :fail "npm install fallo"
    exit /b 1
)

echo %C_DIM%  -> npm run build...%C_RESET%
npm run build
if errorlevel 1 (
    popd
    call :fail "npm run build fallo"
    exit /b 1
)
popd

if not exist "%ROOT%\ui\dist\index.html" (
    call :fail "El build no genero ui\dist\index.html"
    exit /b 1
)
call :ok "Frontend compilado en ui\dist\"
goto :eof

:: ============================================================
:install_pyinstaller
call :step "Verificando PyInstaller"

pyinstaller --version >nul 2>&1
if errorlevel 1 (
    echo %C_DIM%  -> Instalando PyInstaller...%C_RESET%
    pip install "pyinstaller>=6.0" --quiet
    if errorlevel 1 (
        call :fail "No se pudo instalar PyInstaller"
        exit /b 1
    )
)
for /f "tokens=*" %%v in ('pyinstaller --version 2^>^&1') do set "PI_VER=%%v"
call :ok "PyInstaller: %PI_VER%"
goto :eof

:: ============================================================
:build_exe
call :step "Empaquetando con PyInstaller"

if not exist "%ROOT%\m_m_optimizer.spec" (
    call :fail "No se encontro m_m_optimizer.spec en la raiz"
    exit /b 1
)

if not exist "%ROOT%\ui\dist\index.html" (
    call :fail "ui\dist no encontrado. Correr sin --skip-frontend o ejecutar 'cd ui && npm run build' primero"
    exit /b 1
)

:: Limpiar builds anteriores para asegurar estado limpio
if exist "%ROOT%\dist\m_m_optimizer" (
    echo %C_DIM%  -> Limpiando dist\ anterior...%C_RESET%
    rmdir /s /q "%ROOT%\dist\m_m_optimizer" 2>nul
)
if exist "%ROOT%\build\m_m_optimizer" (
    rmdir /s /q "%ROOT%\build\m_m_optimizer" 2>nul
)

echo %C_DIM%  -> Ejecutando PyInstaller (puede tardar 1-3 min)...%C_RESET%
pushd "%ROOT%"
pyinstaller m_m_optimizer.spec --noconfirm --log-level WARN
if errorlevel 1 (
    popd
    call :fail "PyInstaller fallo. Revisar la salida de arriba para mas detalles."
    exit /b 1
)
popd

if not exist "%ROOT%\dist\m_m_optimizer\m_m_optimizer.exe" (
    call :fail "El .exe no fue generado en dist\m_m_optimizer\"
    exit /b 1
)
call :ok "Ejecutable generado"
goto :eof

:: ============================================================
:build_installer
call :step "Compilando instalador con Inno Setup"

:: Buscar iscc.exe en las rutas tipicas de instalacion de Inno Setup
set "ISCC="
if exist "C:\Program Files (x86)\Inno Setup 6\iscc.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\iscc.exe"
if exist "C:\Program Files\Inno Setup 6\iscc.exe"       set "ISCC=C:\Program Files\Inno Setup 6\iscc.exe"

if "%ISCC%"=="" (
    call :warn "Inno Setup no encontrado. El instalador NO fue generado."
    call :warn "Descargar desde: https://jrsoftware.org/isinfo.php"
    call :warn "Luego ejecutar manualmente: iscc installer\m_m_optimizer.iss"
    goto :eof
)

if not exist "%ROOT%\installer\m_m_optimizer.iss" (
    call :fail "No se encontro installer\m_m_optimizer.iss"
    exit /b 1
)

:: Crear carpeta de salida del instalador
if not exist "%ROOT%\installer\output" mkdir "%ROOT%\installer\output"

echo %C_DIM%  -> Compilando .iss (puede tardar 30-60 seg)...%C_RESET%
"%ISCC%" "%ROOT%\installer\m_m_optimizer.iss"
if errorlevel 1 (
    call :fail "Inno Setup fallo. Revisar la salida de arriba."
    exit /b 1
)

:: Verificar que el instalador fue creado
set "INSTALLER_FOUND=0"
for %%f in ("%ROOT%\installer\output\setup_*.exe") do (
    set "INSTALLER_FILE=%%f"
    set "INSTALLER_FOUND=1"
)

if "%INSTALLER_FOUND%"=="0" (
    call :fail "Inno Setup no genero el instalador en installer\output\"
    exit /b 1
)
call :ok "Instalador generado: %INSTALLER_FILE%"
goto :eof

:: ============================================================
:done
echo.
echo %C_BOLD%%C_GREEN%  ================================================%C_RESET%
echo %C_BOLD%%C_GREEN%  OK  Build completado exitosamente%C_RESET%
echo %C_BOLD%%C_GREEN%  ================================================%C_RESET%
echo.
echo %C_CYAN%  Instalador:%C_RESET%
for %%f in ("%ROOT%\installer\output\setup_*.exe") do (
    echo     %C_BOLD%%%f%C_RESET%
)
echo.
echo %C_CYAN%  Distribuir:%C_RESET%
echo     Compartir ese unico archivo .exe - incluye todo lo necesario.
echo     Los datos del usuario se guardan en %%APPDATA%%\m_m_optimizer-cnc\
echo.
echo %C_DIM%  Tip: build_exe.bat --skip-frontend  (omite npm build si ya esta hecho)%C_RESET%
echo.

:: Abrir carpeta del instalador en Explorer
if exist "%ROOT%\installer\output" (
    explorer "%ROOT%\installer\output"
)
goto :eof

:: ============================================================
:: Helpers de logging
:: ============================================================
:step
echo.
echo %C_BOLD%%C_CYAN%  >> %~1%C_RESET%
goto :eof

:ok
echo %C_GREEN%    + %~1%C_RESET%
goto :eof

:warn
echo %C_YELLOW%    ! %~1%C_RESET%
goto :eof

:fail
echo.
echo %C_BOLD%%C_RED%  ========================================%C_RESET%
echo %C_BOLD%%C_RED%  ERROR: %~1%C_RESET%
echo %C_BOLD%%C_RED%  ========================================%C_RESET%
goto :eof