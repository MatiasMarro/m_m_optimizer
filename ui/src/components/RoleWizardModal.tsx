import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

// ─── role catalogue ───────────────────────────────────────────────────────────

export const ROLE_OPTIONS = [
  { value: "", label: "— sin asignar —" },
  { value: "lateral", label: "Lateral" },
  { value: "tapa", label: "Tapa" },
  { value: "fondo", label: "Fondo" },
  { value: "base", label: "Base" },
  { value: "estante", label: "Estante" },
  { value: "cajón", label: "Cajón" },
  { value: "puerta", label: "Puerta" },
  { value: "zócalo", label: "Zócalo" },
  { value: "perfil", label: "Perfil" },
] as const;

// ─── props ────────────────────────────────────────────────────────────────────

interface Props {
  furnitureId: string;
  furnitureName: string;
  layers: string[];
  initialRoles: Record<string, string>;
  layerDepths?: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function RoleWizardModal({
  furnitureId,
  furnitureName,
  layers,
  initialRoles,
  layerDepths,
  onClose,
  onSaved,
}: Props) {
  const [roles, setRoles] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of layers) init[l] = initialRoles[l] ?? "";
    return init;
  });
  const [depths, setDepths] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of layers) {
      const v = layerDepths?.[l];
      init[l] = v !== undefined ? String(v) : "";
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus trap: first select
  const firstSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    firstSelectRef.current?.focus();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateFurnitureRoles(furnitureId, roles);
      // Persistir overrides de profundidad (solo los que tienen valor numérico)
      const depthsToSave: Record<string, number> = {};
      for (const l of layers) {
        const v = parseFloat(depths[l]);
        if (!isNaN(v) && v >= 0) depthsToSave[l] = v;
      }
      await api.updateLayerDepths(furnitureId, depthsToSave);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestAI = async () => {
    setSuggesting(true);
    setError(null);
    setAiNote(null);
    try {
      const res = await api.suggestRoles(furnitureId);
      setRoles((prev) => {
        const next = { ...prev };
        let applied = 0;
        for (const layer of layers) {
          const sug = res.suggestions[layer];
          if (sug && sug !== "skip") {
            next[layer] = sug;
            applied += 1;
          }
        }
        setAiNote(
          `IA (${res.model}) sugirió ${applied}/${res.layers_analyzed} layers. ` +
          `Revisá y guardá.`,
        );
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lower = msg.toLowerCase();
      // El backend devuelve 422 si no hay API key
      let friendly: string;
      if (lower.includes("anthropic_api_key") || lower.includes("api key") || lower.includes("422")) {
        friendly = "Falta configurar la API key de IA. Andá a Ajustes → Inteligencia Artificial.";
      } else if (lower.includes("network") || lower.includes("failed to fetch")) {
        friendly = "No pudimos conectar con el servicio de IA. Probá de nuevo en unos segundos.";
      } else {
        friendly = "La sugerencia de IA falló. Asigná los roles manualmente o reintentá.";
      }
      setError(friendly);
    } finally {
      setSuggesting(false);
    }
  };

  return createPortal(
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="true"
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-wizard-title"
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="role-wizard-title"
              className="text-sm font-semibold text-text"
            >
              Asignar roles de layers
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted" title={furnitureName}>
              {furnitureName}
              {layers.length > 0 && (() => {
                const assigned = layers.filter((l) => roles[l]).length;
                const pct = layers.length > 0 ? assigned / layers.length : 0;
                const tone =
                  pct === 1 ? "text-success" : pct > 0 ? "text-warning" : "text-muted";
                return (
                  <span className={`ml-2 font-medium ${tone}`}>
                    · {assigned}/{layers.length} asignados
                  </span>
                );
              })()}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X size={15} />
          </button>
        </div>

        {/* AI suggestion bar */}
        {layers.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-5 py-2">
            <Button
              variant="ghost"
              onClick={handleSuggestAI}
              disabled={suggesting || saving}
              className="h-7 px-2 text-xs"
              title="Claude Opus 4.7 analiza los layers y propone roles"
            >
              <Sparkles size={12} />
              {suggesting ? "Analizando…" : "Sugerir con IA"}
            </Button>
            {aiNote && (
              <span className="truncate text-[11px] text-muted">{aiNote}</span>
            )}
          </div>
        )}

        {/* Layer list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {layers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Este mueble no tiene layers detectados.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {layers.map((layer, i) => {
                const isUnassigned = !roles[layer];
                return (
                <div
                  key={layer}
                  className={`flex items-center gap-3 rounded border px-3 py-2 ${
                    isUnassigned
                      ? "border-warning/40 bg-warning/5"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-mono text-xs text-text"
                      title={layer}
                    >
                      {layer}
                    </div>
                  </div>
                  {/* Profundidad editable */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={depths[layer] ?? ""}
                      onChange={(e) =>
                        setDepths((prev) => ({ ...prev, [layer]: e.target.value }))
                      }
                      placeholder="Z"
                      title="Profundidad Z (mm)"
                      className="h-8 w-16 rounded border border-border bg-surface px-2 text-right font-mono text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-[10px] text-muted">mm</span>
                  </div>
                  <select
                    ref={i === 0 ? firstSelectRef : undefined}
                    value={roles[layer] ?? ""}
                    onChange={(e) =>
                      setRoles((prev) => ({ ...prev, [layer]: e.target.value }))
                    }
                    className="h-8 rounded border border-border bg-surface px-2 text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="border-t border-border px-5 py-2 text-xs text-danger">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || layers.length === 0}
          >
            {saving ? "Guardando…" : "Guardar roles"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
