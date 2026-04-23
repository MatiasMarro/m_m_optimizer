@echo off
echo.
echo Verificando requisitos...
echo.

echo [1/4] Python
python --version 2>nul
if errorlevel 1 (
    echo   ERROR: Python no encontrado
) else (
    echo   OK
)

echo [2/4] Node.js
node --version 2>nul
if errorlevel 1 (
    echo   ERROR: Node.js no encontrado
) else (
    echo   OK
)

echo [3/4] pip
python -m pip --version 2>nul
if errorlevel 1 (
    echo   ERROR: pip no encontrado
) else (
    echo   OK
)

echo [4/4] npm
npm --version 2>nul
if errorlevel 1 (
    echo   ERROR: npm no encontrado
) else (
    echo   OK
)

echo.
echo Si todo dice OK, ejecuta: run.bat
echo.
pause
