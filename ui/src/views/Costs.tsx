import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, DollarSign, RefreshCw, RotateCcw, Sliders, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import { useProject } from "@/store/projectStore";
import { api } from "@/lib/api";
import type { Cost, CostingConfig, CostingOverrides } from "@/lib/types";

const ARS = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

export default function Costs() {
  const nav = useNavigate();
  const { result, costsMayBeStale, recomputeCosts } = useProject();
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const c = result?.costo;

  const onRecompute = async () => {
    setRecomputing(true);
    setRecomputeError(null);
    const res = await recomputeCosts();
    if (!res.ok) setRecomputeError(res.error);
    setRecomputing(false);
  };

  if (!c || !result) {
    return (
      <div className="h-full overflow-auto p-6">
        <h1 className="mb-4 text-xl font-semibold">Costos</h1>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
            <DollarSign size={22} />
          </div>
          <div>
            <p className="text-base font-medium text-text">Todavía no hay costos</p>
            <p className="mt-1 text-sm text-muted">
              Optimizá un proyecto para ver el breakdown.
            </p>
          </div>
          <Button variant="primary" onClick={() => nav("/designer")}>
            <ArrowRight size={16} /> Ir al Diseñador
          </Button>
        </div>
      </div>
    );
  }

  const rows: [string, number][] = [
    [`Placas nuevas (${c.placas_nuevas})`, c.material_placas],
    [`Retazos consumidos (${c.retazos_consumidos})`, c.material_retazos],
    [`Tapacanto (${c.metros_tapacanto.toFixed(2)} m)`, c.tapacanto],
    [`Tiempo CNC (${c.minutos_cnc.toFixed(1)} min)`, c.tiempo_cnc],
    [`Mano de obra (${c.horas_mo.toFixed(2)} h)`, c.mano_obra],
    ["Herrajes", c.herrajes],
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Costos</h1>
      {costsMayBeStale && (
        <div className="mb-4 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-warning">
            <TriangleAlert size={15} />
            Las tarifas cambiaron desde la última optimización. El total puede no estar actualizado.
          </span>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={onRecompute} disabled={recomputing} className="text-xs">
              <RefreshCw size={13} className={recomputing ? "animate-spin" : ""} />
              {recomputing ? "Recalculando…" : "Recalcular ahora"}
            </Button>
            <Button variant="ghost" onClick={() => nav("/designer")} className="text-xs">
              Reoptimizar
            </Button>
          </div>
        </div>
      )}
      {recomputeError && (
        <div className="mb-4 max-w-2xl rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
          {recomputeError}
        </div>
      )}

      <div className="grid max-w-2xl grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(240px,auto)]">
        {/* Total card destacado */}
        <div className="order-first flex flex-col justify-center rounded-lg border border-primary/40 bg-primary/5 p-6 lg:order-last">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Total con margen</span>
          <span className="mt-1 font-mono text-3xl font-bold text-primary">{ARS(c.total)}</span>
          <div className="mt-3 flex justify-between text-xs text-muted">
            <span>Subtotal</span>
            <span className="font-mono">{ARS(c.subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>Margen</span>
            <span className="font-mono">{ARS(c.margen)}</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            Desglose
          </div>
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, val]) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-text">{label}</td>
                  <td className="px-4 py-2 text-right font-mono">{ARS(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WhatIfPanel baseTotal={c.total} />
    </div>
  );
}

// ─── What-if panel ────────────────────────────────────────────────────────────

function WhatIfPanel({ baseTotal }: { baseTotal: number }) {
  const { result } = useProject();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<CostingConfig | null>(null);
  const [overrides, setOverrides] = useState<CostingOverrides>({});
  const [preview, setPreview] = useState<Cost | null>(null);
  const [loading, setLoading] = useState(false);
  const debouncer = useRef<number | null>(null);

  useEffect(() => {
    if (!open || config) return;
    void api.getConfig().then(setConfig).catch(() => {});
  }, [open, config]);

  const merged = useMemo(() => {
    if (!config) return null;
    return { ...config, ...overrides };
  }, [config, overrides]);

  useEffect(() => {
    if (!open || !result || !merged) return;
    const empty = Object.values(overrides).every((v) => v === undefined);
    if (empty) {
      setPreview(null);
      return;
    }
    if (debouncer.current) window.clearTimeout(debouncer.current);
    debouncer.current = window.setTimeout(() => {
      setLoading(true);
      api
        .recomputeCosts(result.pieces, result.layout, { overrides })
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debouncer.current) window.clearTimeout(debouncer.current);
    };
  }, [overrides, open, result, merged]);

  const reset = () => {
    setOverrides({});
    setPreview(null);
  };

  const set = (k: keyof CostingOverrides, v: number) =>
    setOverrides((o) => ({ ...o, [k]: v }));

  const delta = preview ? preview.total - baseTotal : 0;
  const deltaPct = baseTotal > 0 ? (delta / baseTotal) * 100 : 0;

  return (
    <div className="mt-6 max-w-2xl rounded-lg border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text hover:bg-surface-2"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Sliders size={14} />
          Análisis what-if
          <span className="text-xs font-normal text-muted">
            (no toca tu config guardada)
          </span>
        </span>
        <span className="text-xs text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-border p-4">
          {!merged ? (
            <p className="text-xs text-muted">Cargando config…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Slider
                  label="Precio placa MDF"
                  value={merged.precio_placa_mdf18}
                  base={config!.precio_placa_mdf18}
                  min={Math.round(config!.precio_placa_mdf18 * 0.5)}
                  max={Math.round(config!.precio_placa_mdf18 * 2)}
                  step={500}
                  format={(n) => `$${Math.round(n).toLocaleString("es-AR")}`}
                  onChange={(v) => set("precio_placa_mdf18", v)}
                />
                <Slider
                  label="Margen (%)"
                  value={merged.margen * 100}
                  base={config!.margen * 100}
                  min={0}
                  max={100}
                  step={1}
                  format={(n) => `${n.toFixed(0)}%`}
                  onChange={(v) => set("margen", v / 100)}
                />
                <Slider
                  label="Factor valor retazo"
                  value={merged.factor_valor_retazo}
                  base={config!.factor_valor_retazo}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(n) => n.toFixed(2)}
                  onChange={(v) => set("factor_valor_retazo", v)}
                />
                <Slider
                  label="Costo hora CNC"
                  value={merged.costo_hora_cnc}
                  base={config!.costo_hora_cnc}
                  min={Math.round(config!.costo_hora_cnc * 0.5)}
                  max={Math.round(config!.costo_hora_cnc * 2)}
                  step={250}
                  format={(n) => `$${Math.round(n).toLocaleString("es-AR")}`}
                  onChange={(v) => set("costo_hora_cnc", v)}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface-2 px-3 py-2 text-sm">
                <div>
                  <span className="text-xs text-muted">Total simulado:</span>{" "}
                  {loading ? (
                    <span className="font-mono text-muted">recalculando…</span>
                  ) : preview ? (
                    <span className="font-mono font-semibold text-text">{ARS(preview.total)}</span>
                  ) : (
                    <span className="font-mono text-muted">—</span>
                  )}
                  {preview && (
                    <span
                      className={`ml-2 font-mono text-xs ${
                        delta < 0 ? "text-success" : delta > 0 ? "text-danger" : "text-muted"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {ARS(delta)} ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                    </span>
                  )}
                </div>
                <Button variant="ghost" onClick={reset} className="text-xs">
                  <RotateCcw size={12} /> Reset
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Estos cambios son temporales. Para persistirlos editalos en Ajustes.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Slider({
  label, value, base, min, max, step, format, onChange,
}: {
  label: string;
  value: number;
  base: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (v: number) => void;
}) {
  const dirty = value !== base;
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span
          className={`font-mono text-xs ${dirty ? "text-primary" : "text-text"}`}
          title={dirty ? `Base: ${format(base)}` : undefined}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}
