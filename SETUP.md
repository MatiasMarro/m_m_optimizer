# Setup & Ejecución

## Opción 1: Automático (Windows)

### Método A: `run.bat` (recomendado)
**Doble click en `run.bat`** — hace todo:
- Verifica Python + Node
- Instala dependencias (primera vez)
- Abre Backend (puerto 8000) y Frontend (puerto 5173)
- Abre el navegador automáticamente

Cierra ambas ventanas de consola para detener.

### Método B: `run_debug.bat` (si Método A falla)
Si `run.bat` se cierra sin mensaje:
1. **Doble click en `run_debug.bat`**
2. Verás todos los errores en pantalla
3. Pegame el error que ves para diagnosticar

Los requisitos previos son:
- **Python 3.11+** en PATH (`python --version` en cmd debe funcionar)
- **Node.js 18+** en PATH (`node --version` en cmd debe funcionar)

---

## Opción 2: Manual (Windows / Mac / Linux)

### Requisitos previos
- Python 3.11+
- Node.js 18+

### Paso 1: Backend
```bash
# En la raíz del repo
python -m venv venv
venv\Scripts\activate              # Windows
# source venv/bin/activate          # Mac/Linux

pip install -r requirements.txt
uvicorn api.server:app --reload --port 8000
```
Deberías ver:
```
Uvicorn running on http://127.0.0.1:8000
```

### Paso 2: Frontend (en otra terminal)
```bash
cd ui
npm install              # Primera vez solamente
npm run dev
```
Deberías ver:
```
Local:   http://localhost:5173
```

### Paso 3: Abrí el navegador
Ve a **http://localhost:5173**

---

## Flujo básico

1. **Diseñador** (rail izquierdo) → ajustá ancho/alto/profundidad → click **Optimizar**
2. Se redirige a **Nesting** → ves el layout con las placas
3. **Costos** → breakdown de gastos
4. **Retazos** → inventario automático de retazos generados
5. **Exportar** → genera DXF compatible con Aspire

---

## Troubleshooting

### `ModuleNotFoundError: fastapi`
```bash
pip install -r requirements.txt
```

### `npm: command not found`
Node.js no está instalado. Descargalo de https://nodejs.org (LTS)

### Puerto 8000 ocupado
```bash
# Cambiar puerto en el comando uvicorn
uvicorn api.server:app --reload --port 9000
# Luego en ui/vite.config.ts, cambiar proxy target a :9000
```

### Puerto 5173 ocupado (menos probable)
Vite usa el siguiente puerto disponible automáticamente.
