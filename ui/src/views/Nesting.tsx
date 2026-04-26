// Copyright (c) 2024-2026 Matías Marro. All rights reserved.
// m_m_optimizer-cnc — Unauthorized use or distribution is prohibited.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, FolderKanban, GitCompareArrows, LayoutGrid, Recycle, Ruler, X } from "lucide-react";
import Button from "@/components/ui/Button";
import CanvasToolbar from "@/components/canvas/CanvasToolbar";
import LayoutMiniPreview from "@/components/LayoutMiniPreview";
import NestingCanvas, { type NestingCanvasHandle } from "@/components/canvas/NestingCanvas";
import InspectorPanel from "@/components/layout/InspectorPanel";
import { api } from "@/lib/api";
import { useProject } from "@/store/projectStore";

const ARS = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

export default function Nesting() {
  const nav = useNavigate();
  const { result, error, movePiece, inventoryComparison, setInventoryComparison } = useProject();
  const sheets = result?.layout.sheets_used ?? [];
  const newOffcuts = result?.layout.new_offcuts ?? [];
  const unplaced = result?.layout.unplaced ?? [];
  const warnings = result?.warnings ?? [];
  const canvasRef = useRef<NestingCanvasHandle>(null);
  const [kerfMm, setKerfMm] = useState<number>(3);
  const [compareOpen, setCompareOpen] = useState(false);

  const canCompare =
    !!inventoryComparison?.layoutWithout && !!inventoryComparison?.layoutWith;

  useEffect(() => {
    let cancelled = false;
    api
      .getConfig()
      .then((c) => {
        if (!cancelled) setKerfMm(c.kerf_mm);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Atajos locales de canvas: + - F
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        canvasRef.current?.zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        canvasRef.current?.zoomOut();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        canvasRef.current?.fit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!result) {
    return (
      <div className="h-full overflow-auto p-6">
        <h1 className="mb-4 text-xl font-semibold">Nesting</h1>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
            <LayoutGrid size={22} />
          </div>
          <div>
            <p className="text-base font-medium text-text">No hay nesting activo</p>
            <p className="mt-1 text-sm text-muted">
              {error ? <span className="text-danger">{error}</span> : "Diseñá un mueble nuevo o abrí un proyecto guardado."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" onClick={() => nav("/designer")}>
              <Ruler size={16} /> Diseñar mueble
            </Button>
            <Button variant="secondary" onClick={() => nav("/projects")}>
              <FolderKanban size={16} /> Abrir proyecto
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
        {inventoryComparison && (
          <div className="flex items-center gap-3 border-b border-success/40 bg-success/10 px-4 py-2.5 text-sm">
            <Recycle size={18} className="shrink-0 text-success" />
            <div className="flex-1">
              <p className="font-medium text-text">
                {inventoryComparison.fileName} — usaste {inventoryComparison.offcutsUsed} retazo
                {inventoryComparison.offcutsUsed !== 1 ? "s" : ""} y ahorraste{" "}
                <span className="font-semibold text-success">
                  {ARS(inventoryComparison.savingsArs)}
                </span>{" "}
                <span className="text-muted">
                  ({(inventoryComparison.savingsPct * 100).toFixed(1)}%)
                </span>
              </p>
              <p className="text-xs text-muted">
                Sin retazos: {inventoryComparison.sheetsWithout} placa
                {inventoryComparison.sheetsWithout !== 1 ? "s" : ""} ·
                Con retazos: {inventoryComparison.sheetsWith} placa
                {inventoryComparison.sheetsWith !== 1 ? "s" : ""} +{" "}
                {inventoryComparison.offcutsUsed} retazo
                {inventoryComparison.offcutsUsed !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canCompare && (
                <button
                  onClick={() => setCompareOpen(true)}
                  className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/15 px-2 py-1 text-xs font-medium text-success hover:bg-success/25"
                  title="Ver layouts lado a lado"
                >
                  <GitCompareArrows size={13} /> Ver comparación
                </button>
              )}
              <button
                onClick={() => setInventoryComparison(null)}
                className="rounded p-1 text-muted hover:bg-success/20 hover:text-text"
                aria-label="Cerrar"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {sheets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted">
              {error ? <span className="text-danger">{error}</span> : "Sin layout. Optimiza un proyecto primero."}
            </div>
          ) : (
            <NestingCanvas
              ref={canvasRef}
              sheets={sheets}
              kerfMm={kerfMm}
              onMovePiece={movePiece}
            />
          )}
        </div>
      </div>

      <InspectorPanel title="Piezas">
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

        <div className="border-t border-border pt-3">
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={() => nav("/costs")}
            >
              <ArrowRight size={16} /> Ver costos
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-center"
              onClick={() => nav("/export")}
            >
              <ArrowRight size={16} /> Exportar DXF
            </Button>
          </div>
        </div>
      </InspectorPanel>

      {compareOpen && inventoryComparison &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setCompareOpen(false); }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="compare-title"
              className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 id="compare-title" className="text-sm font-semibold">
                    Comparación de optimizaciones — {inventoryComparison.fileName}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Sin retazos vs. con retazos del inventario
                  </p>
                </div>
                <button
                  onClick={() => setCompareOpen(false)}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-5 overflow-auto p-5 lg:grid-cols-2">
                <section>
                  <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                    <span>Sin retazos</span>
                    <span className="font-mono normal-case text-text">
                      {inventoryComparison.sheetsWithout} placa{inventoryComparison.sheetsWithout !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <LayoutMiniPreview sheets={inventoryComparison.layoutWithout ?? []} />
                </section>
                <section>
                  <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                    <span>Con retazos del inventario</span>
                    <span className="font-mono normal-case text-text">
                      {inventoryComparison.sheetsWith} placa{inventoryComparison.sheetsWith !== 1 ? "s" : ""}
                      {inventoryComparison.offcutsUsed > 0 && (
                        <> + {inventoryComparison.offcutsUsed} retazo{inventoryComparison.offcutsUsed !== 1 ? "s" : ""}</>
                      )}
                    </span>
                  </h3>
                  <LayoutMiniPreview sheets={inventoryComparison.layoutWith ?? []} />
                </section>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2 px-5 py-3 text-sm">
                <div className="flex items-center gap-2 text-success">
                  <Recycle size={15} />
                  <span className="font-semibold">
                    {ARS(inventoryComparison.savingsArs)}
                  </span>
                  <span className="text-xs text-muted">
                    ahorrado ({(inventoryComparison.savingsPct * 100).toFixed(1)}%)
                  </span>
                </div>
                <Button variant="primary" onClick={() => setCompareOpen(false)}>Cerrar</Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
