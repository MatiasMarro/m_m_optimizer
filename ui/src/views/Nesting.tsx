import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import CanvasToolbar from "@/components/canvas/CanvasToolbar";
import NestingCanvas, { type NestingCanvasHandle } from "@/components/canvas/NestingCanvas";
import InspectorPanel from "@/components/layout/InspectorPanel";
import { useProject } from "@/store/projectStore";

export default function Nesting() {
  const { result, error } = useProject();
  const sheets = result?.layout.sheets_used ?? [];
  const newOffcuts = result?.layout.new_offcuts ?? [];
  const unplaced = result?.layout.unplaced ?? [];
  const warnings = result?.warnings ?? [];
  const canvasRef = useRef<NestingCanvasHandle>(null);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <CanvasToolbar
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onFit={() => canvasRef.current?.fit()}
        />
        {warnings.length > 0 && (
          <div className="flex items-start gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <ul className="space-y-0.5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {sheets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted">
              {error ? <span className="text-danger">{error}</span> : "Sin layout. Optimiza un proyecto primero."}
            </div>
          ) : (
            <NestingCanvas ref={canvasRef} sheets={sheets} />
          )}
        </div>
      </div>

      <InspectorPanel title="Piezas">
        {result ? (
          <>
            <ul className="space-y-1 font-mono text-xs">
              {result.pieces.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-muted">{p.width}×{p.height} ·{p.qty}</span>
                </li>
              ))}
            </ul>

            {unplaced.length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-danger">
                  No colocadas ({unplaced.reduce((n, p) => n + p.qty, 0)})
                </div>
                <ul className="space-y-1">
                  {unplaced.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-xs"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-muted">{p.width}×{p.height} ·{p.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {newOffcuts.length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Nuevos retazos ({newOffcuts.length})
                </div>
                <ul className="space-y-1">
                  {newOffcuts.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between rounded border border-offcut/40 bg-offcut/10 px-2 py-1 font-mono text-xs"
                    >
                      <span className="font-semibold">{o.id}</span>
                      <span className="text-muted">{o.width}×{o.height}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[11px] text-muted">
                  Persistidos en el inventario automáticamente.
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-muted">Sin datos.</div>
        )}
      </InspectorPanel>
    </div>
  );
}
