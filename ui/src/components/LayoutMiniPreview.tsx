import type { SheetUsage } from "@/lib/types";

interface Props {
  sheets: SheetUsage[];
  sheetWidthPx?: number;
  emptyLabel?: string;
}

export default function LayoutMiniPreview({
  sheets,
  sheetWidthPx = 180,
  emptyLabel = "Sin placas",
}: Props) {
  if (sheets.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-3">
      {sheets.map((s, i) => {
        const aspect = s.sheet_height / Math.max(1, s.sheet_width);
        const heightPx = sheetWidthPx * aspect;
        const scale = sheetWidthPx / Math.max(1, s.sheet_width);
        return (
          <div key={`${s.sheet_id}-${i}`} className="flex flex-col gap-1">
            <div
              className="relative overflow-hidden rounded border border-border bg-surface-2"
              style={{ width: sheetWidthPx, height: heightPx }}
              title={`${s.sheet_id} · ${s.sheet_width}×${s.sheet_height}`}
            >
              {s.placed.map((p, j) => (
                <div
                  key={j}
                  className={`absolute ${
                    s.is_offcut ? "bg-offcut/40" : "bg-primary/40"
                  } border border-primary/60`}
                  style={{
                    // Coords origen inferior-izquierda → invertir Y
                    left: p.x * scale,
                    bottom: p.y * scale,
                    width: p.width * scale,
                    height: p.height * scale,
                  }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="font-mono">
                {s.is_offcut ? "Retazo" : "Placa"} {i + 1}
              </span>
              <span className="font-mono">{Math.round((s.efficiency ?? 0) * 100)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
