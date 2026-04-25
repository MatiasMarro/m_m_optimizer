import { useNavigate } from "react-router-dom";
import { ArrowRight, DollarSign } from "lucide-react";
import Button from "@/components/ui/Button";
import { useProject } from "@/store/projectStore";

const ARS = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

export default function Costs() {
  const nav = useNavigate();
  const { result } = useProject();
  const c = result?.costo;

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
      <div className="max-w-md rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, val]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-muted">{label}</td>
                <td className="px-4 py-2 text-right font-mono">{ARS(val)}</td>
              </tr>
            ))}
            <tr className="border-t border-border bg-surface-2">
              <td className="px-4 py-2 font-semibold">Subtotal</td>
              <td className="px-4 py-2 text-right font-mono font-semibold">{ARS(c.subtotal)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-muted">Margen</td>
              <td className="px-4 py-2 text-right font-mono">{ARS(c.margen)}</td>
            </tr>
            <tr className="bg-primary/10">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 text-right font-mono text-lg font-bold">{ARS(c.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
