import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Rect, Text, Group } from "react-konva";
import type Konva from "konva";
import type { PlacedPiece, SheetUsage } from "@/lib/types";
import { useTokenColors } from "@/lib/useTokenColors";
import {
  applyDragSnap,
  computeSheetOffsets,
  findDropSheet,
  hasCollision,
  previewEfficiency,
  resolveDropPosition,
} from "@/lib/nestingUtils";

interface Props {
  sheets: SheetUsage[];
  gap?: number;
  kerfMm?: number;
  onMovePiece?: (
    fromSheetIdx: number,
    pieceIdx: number,
    toSheetIdx: number,
    x: number,
    y: number,
  ) => void;
}

export type NestingCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

const SHEET_GAP = 200;
const PADDING = 24;
const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const WHEEL_STEP = 1.1;
const BUTTON_STEP = 1.2;
const SNAP_PX = 12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildPalette(base: string, primary: string, accent: string): string[] {
  return [base, primary, accent, withMix(base, primary), withMix(base, accent)];
}

function withMix(a: string, b: string): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return a;
  const mix = [0, 1, 2].map((i) => Math.round(ra[i] * 0.6 + rb[i] * 0.4));
  return `#${mix.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(c: string): [number, number, number] | null {
  const m = c.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface HoverState {
  name: string;
  w: number;
  h: number;
  rotated: boolean;
  x: number;
  y: number;
}

interface DragState {
  fromSheetIdx: number;
  pieceIdx: number;
  pieceWidth: number;
  pieceHeight: number;
  toSheetIdx: number | null;
  collides: boolean;
}

const NestingCanvas = forwardRef<NestingCanvasHandle, Props>(function NestingCanvas(
  { sheets, gap = SHEET_GAP, kerfMm = 3, onMovePiece },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [vp, setVp] = useState({ scale: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const panState = useRef<{
    startX: number;
    startY: number;
    vpX: number;
    vpY: number;
  } | null>(null);

  const tokens = useTokenColors();

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
      setReady(true);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const sheetOffsets = useMemo(
    () => computeSheetOffsets(sheets, gap),
    [sheets, gap],
  );

  const { totalW, totalH } = useMemo(() => {
    if (sheets.length === 0) return { totalW: 1, totalH: 1 };
    const totalW =
      sheets.reduce((acc, s) => acc + s.sheet_width, 0) + gap * (sheets.length - 1);
    const totalH = Math.max(...sheets.map((s) => s.sheet_height));
    return { totalW, totalH };
  }, [sheets, gap]);

  // Refs kept in sync so dragBoundFunc always sees latest values.
  const vpRef = useRef(vp);
  const sheetsRef = useRef(sheets);
  const sheetOffsetsRef = useRef(sheetOffsets);
  const kerfRef = useRef(kerfMm);
  useEffect(() => {
    vpRef.current = vp;
  }, [vp]);
  useEffect(() => {
    sheetsRef.current = sheets;
    sheetOffsetsRef.current = sheetOffsets;
  }, [sheets, sheetOffsets]);
  useEffect(() => {
    kerfRef.current = kerfMm;
  }, [kerfMm]);

  const computeFit = useCallback(() => {
    if (totalW <= 0 || totalH <= 0 || size.w <= 0 || size.h <= 0) {
      return { scale: 1, x: PADDING, y: PADDING };
    }
    const scale = clamp(
      Math.min(
        (size.w - PADDING * 2) / totalW,
        (size.h - PADDING * 2) / totalH,
      ),
      MIN_SCALE,
      MAX_SCALE,
    );
    return { scale, x: PADDING, y: PADDING };
  }, [size.w, size.h, totalW, totalH]);

  const zoomAtStageCenter = useCallback(
    (factor: number) => {
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
    },
    [size.w, size.h],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAtStageCenter(BUTTON_STEP),
      zoomOut: () => zoomAtStageCenter(1 / BUTTON_STEP),
      fit: () => setVp(computeFit()),
    }),
    [computeFit, zoomAtStageCenter],
  );

  useEffect(() => {
    setVp(computeFit());
  }, [computeFit]);

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

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Drag-vs-pan: pan only when the click did NOT land on a piece Group.
    if (e.target.findAncestor(".piece", true)) return;
    panState.current = {
      startX: e.evt.clientX,
      startY: e.evt.clientY,
      vpX: vp.x,
      vpY: vp.y,
    };
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!panState.current) return;
    const dx = e.evt.clientX - panState.current.startX;
    const dy = e.evt.clientY - panState.current.startY;
    const origin = panState.current;
    setVp((v) => ({ ...v, x: origin.vpX + dx, y: origin.vpY + dy }));
  };

  const endPan = () => {
    panState.current = null;
  };

  const showHover = (p: PlacedPiece, evt: MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setHover({
      name: p.piece_name,
      w: p.width,
      h: p.height,
      rotated: p.rotated,
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    });
  };

  const displayEfficiency = (sheetIdx: number): number => {
    if (!drag) return sheets[sheetIdx].efficiency;
    const includePiece =
      drag.toSheetIdx === sheetIdx
        ? { width: drag.pieceWidth, height: drag.pieceHeight }
        : null;
    const excludeIdx = drag.fromSheetIdx === sheetIdx ? drag.pieceIdx : null;
    return previewEfficiency(sheets[sheetIdx], excludeIdx, includePiece);
  };

  const invScale = vp.scale > 0 ? 1 / vp.scale : 1;
  const palette = useMemo(
    () => buildPalette(tokens.pieceGrain, tokens.primary, tokens.accent),
    [tokens.pieceGrain, tokens.primary, tokens.accent],
  );

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: tokens.surface2 }}
    >
      {ready && size.w > 0 && size.h > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={vp.scale}
          scaleY={vp.scale}
          x={vp.x}
          y={vp.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endPan}
          onMouseLeave={endPan}
        >
          <Layer>
            {sheets.map((u, i) => (
              <Group key={`sheet-${u.sheet_id}-${i}`} x={sheetOffsets[i]} y={0} listening={true}>
                <Rect
                  width={u.sheet_width}
                  height={u.sheet_height}
                  fill={u.is_offcut ? tokens.offcut : tokens.surface}
                  stroke={
                    drag && drag.toSheetIdx === i ? tokens.primary : tokens.border
                  }
                  strokeWidth={(drag && drag.toSheetIdx === i ? 2 : 1) * invScale}
                  opacity={u.is_offcut ? 0.25 : 1}
                />
                <Text
                  text={`${u.sheet_id} · ${(displayEfficiency(i) * 100).toFixed(1)}%`}
                  fontSize={16 * invScale}
                  fill={tokens.textMuted}
                  y={u.sheet_height + 8 * invScale}
                  listening={false}
                />
              </Group>
            ))}

            {sheets.flatMap((u, sheetIdx) =>
              u.placed.map((p, pieceIdx) => {
                const worldX = sheetOffsets[sheetIdx] + p.x;
                const worldY = p.y;
                const color = palette[hashName(p.piece_name) % palette.length];
                const isDragged =
                  !!drag &&
                  drag.fromSheetIdx === sheetIdx &&
                  drag.pieceIdx === pieceIdx;
                const strokeColor =
                  isDragged && drag.collides ? tokens.danger : tokens.primary;
                const strokeW = (isDragged ? 2 : 1) * invScale;
                return (
                  <Group
                    key={`${u.sheet_id}-${sheetIdx}-${pieceIdx}-${p.piece_name}-${p.x}-${p.y}`}
                    name="piece"
                    x={worldX}
                    y={worldY}
                    draggable
                    dragBoundFunc={(pos) => {
                      const { x: vx, y: vy, scale } = vpRef.current;
                      if (scale <= 0) return pos;
                      const wx = (pos.x - vx) / scale;
                      const wy = (pos.y - vy) / scale;
                      const curSheets = sheetsRef.current;
                      const curOffsets = sheetOffsetsRef.current;
                      const dest = findDropSheet(
                        wx,
                        wy,
                        p.width,
                        p.height,
                        curSheets,
                        curOffsets,
                      );
                      if (!dest) {
                        // outside any sheet → let the cursor roam; dragEnd will revert
                        return pos;
                      }
                      const destSheet = curSheets[dest.idx];
                      const sheetOffX = curOffsets[dest.idx];
                      const excludeIdx =
                        dest.idx === sheetIdx ? pieceIdx : null;
                      const snapped = applyDragSnap({
                        worldX: wx,
                        worldY: wy,
                        pieceW: p.width,
                        pieceH: p.height,
                        sheet: destSheet,
                        excludePieceIdx: excludeIdx,
                        sheetOffsetX: sheetOffX,
                        kerf: kerfRef.current,
                        snapThreshold: SNAP_PX / scale,
                      });
                      return {
                        x: snapped.worldX * scale + vx,
                        y: snapped.worldY * scale + vy,
                      };
                    }}
                    onDragStart={() => {
                      setHover(null);
                      setDrag({
                        fromSheetIdx: sheetIdx,
                        pieceIdx,
                        pieceWidth: p.width,
                        pieceHeight: p.height,
                        toSheetIdx: sheetIdx,
                        collides: false,
                      });
                    }}
                    onDragMove={(e) => {
                      const nx = e.target.x();
                      const ny = e.target.y();
                      const dest = findDropSheet(
                        nx,
                        ny,
                        p.width,
                        p.height,
                        sheets,
                        sheetOffsets,
                      );
                      let collides = false;
                      if (dest) {
                        const destSheet = sheets[dest.idx];
                        const excludeIdx =
                          dest.idx === sheetIdx ? pieceIdx : null;
                        collides = hasCollision(
                          {
                            x: nx - sheetOffsets[dest.idx],
                            y: ny,
                            width: p.width,
                            height: p.height,
                          },
                          destSheet,
                          excludeIdx,
                          kerfMm,
                        );
                      }
                      setDrag((prev) =>
                        prev
                          ? {
                              ...prev,
                              toSheetIdx: dest ? dest.idx : null,
                              collides,
                            }
                          : prev,
                      );
                    }}
                    onDragEnd={(e) => {
                      const nx = e.target.x();
                      const ny = e.target.y();
                      const dest = findDropSheet(
                        nx,
                        ny,
                        p.width,
                        p.height,
                        sheets,
                        sheetOffsets,
                      );
                      setDrag(null);
                      if (!dest || !onMovePiece) {
                        e.target.position({ x: worldX, y: worldY });
                        return;
                      }
                      const destSheet = sheets[dest.idx];
                      const excludeIdx =
                        dest.idx === sheetIdx ? pieceIdx : null;
                      const snapThresholdWorld = SNAP_PX / vp.scale;
                      const resolved = resolveDropPosition(
                        nx,
                        ny,
                        p.width,
                        p.height,
                        destSheet,
                        excludeIdx,
                        sheetOffsets[dest.idx],
                        kerfMm,
                        snapThresholdWorld,
                      );
                      if (!resolved) {
                        // No valid spot on this sheet → revert.
                        e.target.position({ x: worldX, y: worldY });
                        return;
                      }
                      onMovePiece(
                        sheetIdx,
                        pieceIdx,
                        dest.idx,
                        resolved.x,
                        resolved.y,
                      );
                    }}
                    onMouseEnter={(e) => {
                      showHover(p, e.evt);
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = "grab";
                    }}
                    onMouseMove={(e) => showHover(p, e.evt)}
                    onMouseLeave={(e) => {
                      setHover(null);
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = "";
                    }}
                  >
                    <Rect
                      width={p.width}
                      height={p.height}
                      fill={color}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                    />
                    <Text
                      text={p.piece_name}
                      fontSize={14 * invScale}
                      fill={tokens.text}
                      x={4 * invScale}
                      y={4 * invScale}
                      listening={false}
                    />
                  </Group>
                );
              }),
            )}
          </Layer>
        </Stage>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded border px-2 py-1 font-mono text-xs shadow-lg"
          style={{
            left: hover.x + 12,
            top: hover.y + 12,
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            color: tokens.text,
          }}
        >
          <div className="font-semibold">{hover.name}</div>
          <div style={{ color: tokens.textMuted }}>
            {hover.w}×{hover.h}
            {hover.rotated ? " · rotada" : ""}
          </div>
        </div>
      )}
    </div>
  );
});

export default NestingCanvas;
