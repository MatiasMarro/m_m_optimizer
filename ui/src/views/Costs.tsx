import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, DollarSign, RefreshCw, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import { useProject } from "@/store/projectStore";

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

  if (!c) {
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
    </div>
  );
}
