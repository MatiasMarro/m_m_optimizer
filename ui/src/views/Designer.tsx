import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import Button from "@/components/ui/Button";
import InspectorPanel from "@/components/layout/InspectorPanel";
import { useProject } from "@/store/projectStore";
import { api } from "@/lib/api";

function NumberField({ label, value, onChange, step = 10, suffix = "mm" }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded border border-border bg-surface px-2 py-1 font-mono text-sm"
        />
        <span className="text-xs text-muted">{suffix}</span>
      </div>
    </label>
  );
}

export default function Designer() {
  const nav = useNavigate();
  const { spec, setSpec, setResult, setLoading, setError, loading } = useProject();

  const onOptimize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runPipeline({ furniture: spec });
      setResult(res);
      nav("/nesting");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6">
        <h1 className="mb-4 text-xl font-semibold">Diseñador paramétrico</h1>
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          Preview 3D · TODO
        </div>
      </div>

      <InspectorPanel title="Parámetros">
        <div>
          <span className="mb-1 block text-xs text-muted">Tipo</span>
          <select
            value={spec.tipo}
            onChange={(e) => setSpec({ tipo: e.target.value as "cabinet" | "shelving" })}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
          >
            <option value="cabinet">Mueble (cabinet)</option>
            <option value="shelving">Estantería</option>
          </select>
        </div>

        <NumberField label="Ancho" value={spec.ancho} onChange={(ancho) => setSpec({ ancho })} />
        <NumberField label="Alto" value={spec.alto} onChange={(alto) => setSpec({ alto })} />
        <NumberField label="Profundidad" value={spec.profundidad} onChange={(profundidad) => setSpec({ profundidad })} />
        <NumberField
          label="Estantes"
          value={spec.num_estantes ?? 0}
          onChange={(num_estantes) => setSpec({ num_estantes })}
          step={1}
          suffix=""
        />

        <Button onClick={onOptimize} disabled={loading} className="w-full justify-center">
          <Play size={16} /> {loading ? "Optimizando…" : "Optimizar"}
        </Button>
      </InspectorPanel>
    </div>
  );
}
