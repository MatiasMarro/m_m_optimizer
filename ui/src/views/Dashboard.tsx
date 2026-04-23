import { useEffect, useState } from "react";
import { Activity, LayoutGrid, Package, TrendingUp } from "lucide-react";
import KpiCard from "@/components/ui/KpiCard";
import { api } from "@/lib/api";

interface DashboardStats {
  proyectosMes: number;
  eficienciaPromedio: string;
  retazosStock: number;
  proyectosTotal: number;
}

function getMesActual() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [projects, offcuts] = await Promise.all([
          api.listProjects(),
          api.listOffcuts(),
        ]);

        const { year, month } = getMesActual();
        const proyectosMes = projects.filter((p) => {
          const d = new Date(p.created_at);
          return d.getFullYear() === year && d.getMonth() === month;
        });

        // Cargar eficiencias solo de los proyectos del mes (máx 10 para no saturar)
        const recientes = proyectosMes.slice(0, 10);
        let eficienciaPromedio = "—";
        if (recientes.length > 0) {
          const details = await Promise.all(recientes.map((p) => api.getProject(p.id)));
          const eficiencias = details.map((d) => d.result.layout.efficiency);
          const promedio = eficiencias.reduce((a, b) => a + b, 0) / eficiencias.length;
          eficienciaPromedio = `${(promedio * 100).toFixed(1)}%`;
        }

        setStats({
          proyectosMes: proyectosMes.length,
          eficienciaPromedio,
          retazosStock: offcuts.length,
          proyectosTotal: projects.length,
        });
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const fmt = (v: number | string) => (loading ? "…" : String(v));

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      {error && (
        <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Muebles este mes"
          value={fmt(stats?.proyectosMes ?? 0)}
          icon={TrendingUp}
          hint="proyectos creados este mes"
        />
        <KpiCard
          label="Aprov. promedio"
          value={fmt(stats?.eficienciaPromedio ?? "—")}
          icon={LayoutGrid}
          tone={
            stats && stats.eficienciaPromedio !== "—"
              ? parseFloat(stats.eficienciaPromedio) >= 75
                ? "success"
                : parseFloat(stats.eficienciaPromedio) >= 50
                  ? "warning"
                  : "danger"
              : "default"
          }
          hint="eficiencia del nesting (mes actual)"
        />
        <KpiCard
          label="Retazos en stock"
          value={fmt(stats?.retazosStock ?? 0)}
          icon={Package}
          hint="retazos reutilizables disponibles"
        />
        <KpiCard
          label="Proyectos totales"
          value={fmt(stats?.proyectosTotal ?? 0)}
          icon={Activity}
          hint="proyectos guardados en total"
        />
      </div>
      <div className="mt-6 rounded-lg border border-border bg-surface p-10 text-center text-muted">
        Gráficos de tendencia · próximamente
      </div>
    </div>
  );
}

