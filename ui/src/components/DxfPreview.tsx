import { useEffect, useMemo, useState } from "react";
import { api, type FurnitureDetail, type FurniturePiece } from "@/lib/api";

// ─── layer → color category ───────────────────────────────────────────────────

type LayerCategory = "cut" | "drill" | "pocket" | "other";

const CATEGORY_COLORS: Record<LayerCategory, string> = {
  cut: "var(--success)",
  drill: "var(--primary)",
  pocket: "var(--warning)",
  other: "var(--text-muted)",
};

function categorizeLayer(layer: string): LayerCategory {
  const l = layer.toUpperCase();
  if (l.includes("CORTE") || l.includes("PROFILE")) return "cut";
  if (l.includes("TALADRO") || l.includes("DRILL")) return "drill";
  if (l.includes("POCKET") || l.includes("BOLSILLO")) return "pocket";
  return "other";
}

// ─── bbox ─────────────────────────────────────────────────────────────────────

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBbox(pieces: FurniturePiece[]): Bbox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const p of pieces) {
    for (const [x, y] of p.vertices) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      found = true;
    }
  }
  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

// ─── props ────────────────────────────────────────────────────────────────────

interface Props {
  furnitureId: string;
  className?: string;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DxfPreview({ furnitureId, className = "" }: Props) {
  const [detail, setDetail] = useState<FurnitureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    api
      .getFurniture(furnitureId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando DXF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [furnitureId]);

  const viewBox = useMemo(() => {
    if (!detail) return null;
    const bbox = computeBbox(detail.pieces);
    if (!bbox) return null;
    const w = Math.max(bbox.maxX - bbox.minX, 1);
    const h = Math.max(bbox.maxY - bbox.minY, 1);
    const pad = Math.max(w, h) * 0.05;
    // SVG y grows downward; we flip with scale(1,-1) so pieces render with CAD orientation.
    // After flip, rendered y spans [-maxY, -minY]. viewBox encloses that range.
    return {
      x: bbox.minX - pad,
      y: -bbox.maxY - pad,
      w: w + pad * 2,
      h: h + pad * 2,
      strokeScale: Math.max(w, h),
    };
  }, [detail]);

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center rounded border border-border bg-surface-2 ${className}`}
      >
        <div className="h-10 w-10 animate-pulse rounded-full bg-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded border border-border bg-surface-2 p-4 text-center text-xs text-danger ${className}`}
      >
        {error}
      </div>
    );
  }

  if (!detail || !viewBox || detail.pieces.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded border border-border bg-surface-2 p-4 text-center text-xs text-muted ${className}`}
      >
        Sin geometría para previsualizar
      </div>
    );
  }

  const strokeWidth = viewBox.strokeScale / 400;

  return (
    <div className={`rounded border border-border bg-surface-2 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={`Preview DXF de ${detail.name}`}
      >
        <g transform="scale(1,-1)">
          {detail.pieces.map((p) => {
            if (p.vertices.length < 2) return null;
            const category = categorizeLayer(p.layer);
            const color = CATEGORY_COLORS[category];
            const points = p.vertices.map(([x, y]) => `${x},${y}`).join(" ");
            const first = p.vertices[0];
            const last = p.vertices[p.vertices.length - 1];
            const isClosed =
              p.vertices.length >= 3 &&
              Math.abs(first[0] - last[0]) < 0.01 &&
              Math.abs(first[1] - last[1]) < 0.01;
            const title = `${p.layer}${p.role ? ` · ${p.role}` : ""} — ${Math.round(p.width)}×${Math.round(p.height)}mm`;

            return isClosed ? (
              <polygon
                key={p.id}
                points={points}
                fill={color}
                fillOpacity={0.18}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              >
                <title>{title}</title>
              </polygon>
            ) : (
              <polyline
                key={p.id}
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              >
                <title>{title}</title>
              </polyline>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
