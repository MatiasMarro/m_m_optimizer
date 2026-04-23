# Lepton Optimizer (Lepton Sistemas) - Funcionalidades a emular

## Entrada
- Archivos DXF/DWG o lista de piezas (ancho, alto, cantidad, material).
- Grosor de material configurable (18mm MDF en nuestro caso).
- Dimensiones de placas estándar (ej. 1830x2440mm).

## Capacidades
- Nesting automático multi-placa.
- Algoritmo de optimización de corte CNC.
- Rotación de piezas (0° / 90°) permitida.
- Gestión de retazos (sobrantes):
  - Identificador único para cada retazo.
  - Almacenamiento en base de datos de sobrantes.
  - Reutilización automática en próximos trabajos.
- Configuración de espacio entre piezas (kerf de la fresa).

## Salida
- Layout visual de placas con piezas posicionadas.
- Listado de cortes ordenados (secuencia de mecanizado).
- Porcentaje de aprovechamiento por placa.
- Exportación a formatos intermedios compatibles con Aspire v8.502 (ej. DXF con capas por profundidad).

## Reportes
- Costo de material usado.
- Listado de retazos generados/consumidos.