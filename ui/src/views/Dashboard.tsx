import { Activity, LayoutGrid, Package, TrendingUp } from "lucide-react";
import KpiCard from "@/components/ui/KpiCard";

export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Muebles mes" value="0 / 10" icon={TrendingUp} hint="objetivo 8–12" />
        <KpiCard label="Aprov. promedio" value="—" icon={LayoutGrid} tone="success" />
        <KpiCard label="Retazos en stock" value="0" icon={Package} />
        <KpiCard label="Proyectos activos" value="0" icon={Activity} />
      </div>
      <div className="mt-6 rounded-lg border border-border bg-surface p-10 text-center text-muted">
        Gráficos de tendencia · TODO
      </div>
    </div>
  );
}
