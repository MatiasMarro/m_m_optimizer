import { useProject } from "@/store/projectStore";

export default function StatusBar() {
  const { result, loading } = useProject();
  const eff = result ? (result.layout.efficiency * 100).toFixed(1) + "%" : "—";
  const sheets = result?.layout.sheets_used.length ?? 0;
  const total = result ? `$${result.costo.total.toLocaleString("es-AR")}` : "—";

  return (
    <footer className="flex items-center gap-6 border-t border-border bg-surface px-4 font-mono text-xs text-muted">
      <span>{loading ? "calculando…" : "listo"}</span>
      <span>aprov: <b className="text-text">{eff}</b></span>
      <span>placas: <b className="text-text">{sheets}</b></span>
      <span>costo: <b className="text-text">{total}</b></span>
    </footer>
  );
}
