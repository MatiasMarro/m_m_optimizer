import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Rect, Text, Group } from "react-konva";
import type Konva from "konva";
import type { SheetUsage } from "@/lib/types";

interface Props {
  sheets: SheetUsage[];
  gap?: number;
}

export type NestingCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

const SHEET_GAP = 200; // mm, coincide con exporter.py
const PADDING = 24;
const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const WHEEL_STEP = 1.1;
const BUTTON_STEP = 1.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const NestingCanvas = forwardRef<NestingCanvasHandle, Props>(function NestingCanvas(
  { sheets, gap = SHEET_GAP },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [vp, setVp] = useState({ scale: 1, x: 0, y: 0 });

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

  const computeFit = () => {
    if (totalW <= 0 || totalH <= 0) return { scale: 1, x: PADDING, y: PADDING };
    const scale = clamp(
      Math.min(
        (size.w - PADDING * 2) / totalW,
        (size.h - PADDING * 2) / totalH,
      ),
      MIN_SCALE,
      MAX_SCALE,
    );
    return { scale, x: PADDING, y: PADDING };
  };

  const zoomAtStageCenter = (factor: number) => {
    const center = { x: size.w / 2, y: size.h / 2 };
    setVp((v) => {
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const pointTo = {
        x: (center.x - v.x) / v.scale,
        y: (center.y - v.y) / v.scale,
      };
      return {
        scale: newScale,
        x: center.x - pointTo.x * newScale,
        y: center.y - pointTo.y * newScale,
      };
    });
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAtStageCenter(BUTTON_STEP),
    zoomOut: () => zoomAtStageCenter(1 / BUTTON_STEP),
    fit: () => setVp(computeFit()),
  }));

  // Auto-fit al cambiar el layout o el tamaño del contenedor.
  useEffect(() => {
    setVp(computeFit());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, size.w, size.h, totalW, totalH]);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    setVp((v) => {
      const newScale = clamp(
        e.evt.deltaY > 0 ? v.scale / WHEEL_STEP : v.scale * WHEEL_STEP,
        MIN_SCALE,
        MAX_SCALE,
      );
      const pointTo = {
        x: (pointer.x - v.x) / v.scale,
        y: (pointer.y - v.y) / v.scale,
      };
      return {
        scale: newScale,
        x: pointer.x - pointTo.x * newScale,
        y: pointer.y - pointTo.y * newScale,
      };
    });
  };

  const invScale = 1 / vp.scale;
  let offsetX = 0;

  return (
    <div ref={wrapRef} className="h-full w-full overflow-hidden bg-surface-2">
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={vp.scale}
        scaleY={vp.scale}
        x={vp.x}
        y={vp.y}
        draggable
        onWheel={handleWheel}
        onDragEnd={(e) => {
          const node = e.target;
          setVp((v) => ({ ...v, x: node.x(), y: node.y() }));
        }}
      >
        <Layer>
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
                  strokeWidth={invScale}
                  opacity={u.is_offcut ? 0.15 : 1}
                />
                {u.placed.map((p, j) => (
                  <Group key={j} x={p.x} y={p.y}>
                    <Rect
                      width={p.width}
                      height={p.height}
                      fill="var(--piece-grain)"
                      stroke="var(--primary)"
                      strokeWidth={invScale}
                    />
                    <Text
                      text={p.piece_name}
                      fontSize={14 * invScale}
                      fill="var(--text)"
                      x={4 * invScale}
                      y={4 * invScale}
                    />
                  </Group>
                ))}
                <Text
                  text={`${u.sheet_id} · ${(u.efficiency * 100).toFixed(1)}%`}
                  fontSize={16 * invScale}
                  fill="var(--text-muted)"
                  y={u.sheet_height + 8 * invScale}
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
});

export default NestingCanvas;
