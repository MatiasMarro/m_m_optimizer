import { useState } from "react";
import { Download, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useProject } from "@/store/projectStore";

export default function Export() {
  const { spec, setResult, setLoading, setError, result } = useProject();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const onSave = async () => {
    if (!result) return;
    const nombre = prompt("Nombre del proyecto:");
    if (!nombre) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const meta = await api.saveProject(nombre, spec, result);
      setSaveMsg(`Guardado como "${meta.nombre}" (${meta.id})`);
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Exportar</h1>
      <div className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          Genera un DXF compatible con Vectric Aspire. Capas: CONTORNO_PLACA, PIEZAS, ETIQUETAS, RETAZOS.
        </p>
        <div className="flex gap-2">
          <Button onClick={onExport}><Download size={16} /> Exportar DXF</Button>
          <Button variant="secondary" onClick={onSave} disabled={!result || saving}>
            <Save size={16} /> {saving ? "Guardando…" : "Guardar proyecto"}
          </Button>
        </div>
        {result?.dxf_path && (
          <div className="rounded bg-success/10 p-3 text-sm">
            Generado en <code className="font-mono">{result.dxf_path}</code>
          </div>
        )}
        {saveMsg && (
          <div className="rounded bg-surface-2 p-3 text-sm">{saveMsg}</div>
        )}
      </div>
    </div>
  );
}
