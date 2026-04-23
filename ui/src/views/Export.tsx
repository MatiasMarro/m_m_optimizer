import { Download } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useProject } from "@/store/projectStore";

export default function Export() {
  const { spec, setResult, setLoading, setError, result } = useProject();

  const onExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runPipeline({ furniture: spec, export_dxf: true });
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Exportar</h1>
      <div className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          Genera un DXF compatible con Vectric Aspire. Capas: CONTORNO_PLACA, PIEZAS, ETIQUETAS, RETAZOS.
        </p>
        <Button onClick={onExport}><Download size={16} /> Exportar DXF</Button>
        {result?.dxf_path && (
          <div className="rounded bg-success/10 p-3 text-sm">
            Generado en <code className="font-mono">{result.dxf_path}</code>
          </div>
        )}
      </div>
    </div>
  );
}
