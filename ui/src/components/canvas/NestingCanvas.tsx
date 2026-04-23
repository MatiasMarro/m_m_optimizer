import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Group } from "react-konva";
import type { SheetUsage } from "@/lib/types";

interface Props {
  sheets: SheetUsage[];
  gap?: number;
}

const SHEET_GAP = 200; // mm, coincide con exporter.py

/**
 * Renderiza todas las placas horizontalmente con sus piezas colocadas.
 * Escala automática al tamaño del contenedor.
 */
export default function NestingCanvas({ sheets, gap = SHEET_GAP }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(240, height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { totalW, totalH } = useMemo(() => {
    if (sheets.length === 0) return { totalW: 1, totalH: 1 };
    const totalW =
      sheets.reduce((acc, s) => acc + s.sheet_width, 0) + gap * (sheets.length - 1);
    const totalH = Math.max(...sheets.map((s) => s.sheet_height));
    return { totalW, totalH };
  }, [sheets, gap]);

  const padding = 24;
  const scale = Math.min(
    (size.w - padding * 2) / totalW,
    (size.h - padding * 2) / totalH,
  );

  let offsetX = 0;

  return (
    <div ref={wrapRef} className="h-full w-full bg-surface-2">
      <Stage width={size.w} height={size.h}>
        <Layer x={padding} y={padding} scaleX={scale} scaleY={scale}>
          {sheets.map((u, i) => {
            const x = offsetX;
            offsetX += u.sheet_width + gap;
            return (
              <Group key={`${u.sheet_id}-${i}`} x={x} y={0}>
                <Rect
                  width={u.sheet_width}
                  height={u.sheet_height}
                  fill={u.is_offcut ? "var(--offcut)" : "var(--surface)"}
                  stroke="var(--border)"
                  strokeWidth={1 / scale}
                  opacity={u.is_offcut ? 0.15 : 1}
                />
                {u.placed.map((p, j) => (
                  <Group key={j} x={p.x} y={p.y}>
                    <Rect
                      width={p.width}
                      height={p.height}
                      fill="var(--piece-grain)"
                      stroke="var(--primary)"
                      strokeWidth={1 / scale}
                    />
                    <Text
                      text={p.piece_name}
                      fontSize={14 / scale}
                      fill="var(--text)"
                      x={4 / scale}
                      y={4 / scale}
                    />
                  </Group>
                ))}
                <Text
                  text={`${u.sheet_id} · ${(u.efficiency * 100).toFixed(1)}%`}
                  fontSize={16 / scale}
                  fill="var(--text-muted)"
                  y={u.sheet_height + 8 / scale}
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
