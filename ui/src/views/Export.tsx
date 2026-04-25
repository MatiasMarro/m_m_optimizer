import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Save, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useProject } from "@/store/projectStore";

export default function Export() {
  const nav = useNavigate();
  const { spec, result } = useProject();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saveModalOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [saveModalOpen]);

  useEffect(() => {
    if (!saveModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSaveModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saveModalOpen]);

  const onExport = () => {
    const a = document.createElement("a");
    a.href = "/api/output/nesting.dxf";
    a.download = "nesting.dxf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const openSaveModal = () => {
    if (!result) return;
    setProjectName("");
    setSaveMsg(null);
    setSaveModalOpen(true);
  };

  const confirmSave = async () => {
    if (!result || !projectName.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const meta = await api.saveProject(projectName.trim(), spec, result);
      setSaveMsg(`Guardado como "${meta.nombre}" (${meta.id})`);
      setSaveModalOpen(false);
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!result) {
    return (
      <div className="h-full overflow-auto p-6">
        <h1 className="mb-4 text-xl font-semibold">Exportar</h1>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Download size={22} />
          </div>
          <div>
            <p className="text-base font-medium text-text">Todavía no hay nada para exportar</p>
            <p className="mt-1 text-sm text-muted">
              Optimizá un proyecto para generar el DXF.
            </p>
          </div>
          <Button variant="primary" onClick={() => nav("/designer")}>
            <ArrowRight size={16} /> Ir al Diseñador
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Exportar</h1>
      <div className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          Genera un DXF compatible con Vectric Aspire. Capas: CONTORNO_PLACA, PIEZAS, ETIQUETAS, RETAZOS.
        </p>
        <div className="flex gap-2">
          <Button onClick={onExport}><Download size={16} /> Exportar DXF</Button>
          <Button variant="secondary" onClick={openSaveModal} disabled={!result || saving}>
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

      {saveModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSaveModalOpen(false);
            }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="save-project-title"
              className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 id="save-project-title" className="text-sm font-semibold">
                  Guardar proyecto
                </h2>
                <button
                  onClick={() => setSaveModalOpen(false)}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="px-5 py-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Nombre del proyecto</span>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && projectName.trim()) void confirmSave();
                    }}
                    placeholder="Mesa Bauti 600x720"
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                    maxLength={120}
                  />
                </label>
                {saveMsg && (
                  <p className="mt-3 text-xs text-danger">{saveMsg}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="ghost" onClick={() => setSaveModalOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void confirmSave()}
                  disabled={saving || !projectName.trim()}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
