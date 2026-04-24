# Lepton Optimizer (Lepton Sistemas) - Funcionalidades a emular

## Entrada
- Archivos DXF/DWG o lista de piezas (ancho, alto, cantidad, material).
- Grosor de material configurable (18mm MDF en nuestro caso).
- Dimensiones de placas estándar (ej. 1830x2440mm).

## Capacidades
- Nesting automático multi-placa. ✅ **Implementado** (`nesting/optimizer.py`)
- Algoritmo de optimización de corte CNC. ✅ **Implementado** (rectpack MaxRectsBssf)
- Rotación de piezas (0° / 90°) permitida. ✅ **Implementado** (respeta `grain_locked`)
- Gestión de retazos (sobrantes): ✅ **Implementado**
  - Identificador único para cada retazo.
  - Almacenamiento en base de datos de sobrantes (`data/offcuts.json`).
  - Reutilización automática en próximos trabajos.
- Configuración de espacio entre piezas (kerf de la fresa). ✅ **Implementado** (configurable desde Settings UI, persiste en `data/config.json`)
- Drag & drop manual de piezas en el canvas. ✅ **Implementado** (snap kerf, colisiones, eficiencia en vivo)

## Salida
- Layout visual de placas con piezas posicionadas. ✅ **Implementado** (Konva canvas)
- Listado de cortes ordenados (secuencia de mecanizado). ⚠️ Pendiente
- Porcentaje de aprovechamiento por placa. ✅ **Implementado** (muestra % por placa y global)
- Exportación a formatos intermedios compatibles con Aspire v8.502 (ej. DXF con capas por profundidad). ✅ **Implementado** (`nesting/exporter.py`)

## Reportes
- Costo de material usado. ✅ **Implementado** (`costing/calculator.py`, vista Costos)
- Listado de retazos generados/consumidos. ✅ **Implementado** (vista Inventario)

## Pendiente / Backlog
- ❌ **DXF importer**: entrada de formas arbitrarias desde DXF/DWG → `Piece`
- ❌ **Preview 3D/2D** en Diseñador (placeholder activo)
- ❌ **Nesting no-rectangular** con `pynest2d`
- ❌ **Listado de cortes ordenados** (secuencia de mecanizado optimizada)
