import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { api, type AIConfigStatus } from "@/lib/api";
import type { CostingConfig } from "@/lib/types";
import Button from "@/components/ui/Button";
import { useProject } from "@/store/projectStore";

function Field({
  label,
  value,
  onChange,
  step = 100,
  suffix = "$",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
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
        <span className="w-16 shrink-0 text-xs text-muted">{suffix}</span>
      </div>
    </label>
  );
}

export default function Settings() {
  const { setCostsMayBeStale } = useProject();
  const [cfg, setCfg] = useState<CostingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // AI config
  const [aiCfg, setAiCfg] = useState<AIConfigStatus | null>(null);
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((raw) => setCfg({ ...raw, margen: raw.margen * 100 }))
      .catch((e) => setMsg({ ok: false, text: String(e) }));
    api.getAIConfig().then(setAiCfg).catch(() => {});
  }, []);

  const saveAIKey = async (clear = false) => {
    setAiSaving(true);
    setAiMsg(null);
    try {
      const next = await api.setAIKey(clear ? null : aiKeyInput.trim() || null);
      setAiCfg(next);
      setAiKeyInput("");
      setAiMsg({ ok: true, text: clear ? "API key eliminada" : "API key guardada" });
      setTimeout(() => setAiMsg(null), 3000);
    } catch (e) {
      setAiMsg({ ok: false, text: String(e) });
    } finally {
      setAiSaving(false);
    }
  };

  const patch =
    (key: keyof CostingConfig) => (val: number) =>
      setCfg((prev) => (prev ? { ...prev, [key]: val } : prev));

  const save = async () => {
    if (!cfg) return;
    setLoading(true);
    setMsg(null);
    try {
      await api.putConfig({ ...cfg, margen: cfg.margen / 100 });
      setCostsMayBeStale(true);
      setMsg({ ok: true, text: "Guardado correctamente" });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Ajustes</h1>

      {!cfg ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          {msg ? msg.text : "Cargando…"}
        </div>
      ) : (
        <>
        <div className="mx-auto max-w-lg rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-4 text-sm font-medium text-muted uppercase tracking-wide">
            Tarifas
          </h2>
          <div className="space-y-4">
            <Field
              label="Precio placa MDF 18mm"
              value={cfg.precio_placa_mdf18}
              onChange={patch("precio_placa_mdf18")}
              step={1000}
              suffix="$ / placa"
            />
            <Field
              label="Factor valor retazo"
              value={cfg.factor_valor_retazo}
              onChange={patch("factor_valor_retazo")}
              step={0.05}
              suffix="ratio"
            />
            <Field
              label="Precio tapacanto"
              value={cfg.precio_tapacanto_m}
              onChange={patch("precio_tapacanto_m")}
              step={100}
              suffix="$ / m"
            />
            <Field
              label="Costo hora CNC"
              value={cfg.costo_hora_cnc}
              onChange={patch("costo_hora_cnc")}
              step={500}
              suffix="$ / h"
            />
            <Field
              label="Costo hora mano de obra"
              value={cfg.costo_hora_mo}
              onChange={patch("costo_hora_mo")}
              step={500}
              suffix="$ / h"
            />
            <Field
              label="Horas MO por defecto"
              value={cfg.horas_mo_default}
              onChange={patch("horas_mo_default")}
              step={0.5}
              suffix="h"
            />
            <Field
              label="Margen"
              value={cfg.margen}
              onChange={patch("margen")}
              step={1}
              suffix="%"
            />
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Button onClick={save} disabled={loading}>
              {loading ? "Guardando…" : "Guardar"}
            </Button>
            {msg && (
              <span
                className={`text-sm ${msg.ok ? "text-green-500" : "text-red-500"}`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </div>

        {/* ── Inteligencia Artificial ─────────────────────── */}
        <div className="mx-auto mt-6 max-w-lg rounded-lg border border-border bg-surface p-6">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Inteligencia Artificial
            </h2>
          </div>
          <p className="mb-4 text-xs text-muted">
            Configurá la API key de Anthropic para habilitar "Sugerir con IA" en el wizard de roles.
            Modelo usado: <span className="font-mono text-text">{aiCfg?.model ?? "claude-opus-4-7"}</span>.
            La key se guarda en <span className="font-mono">data/config.json</span> (texto plano — usá una key dedicada con límite de gasto).
          </p>

          {aiCfg?.has_anthropic_api_key ? (
            <div className="mb-3 flex items-center justify-between rounded border border-success/40 bg-success/10 px-3 py-2 text-xs">
              <span>
                Key configurada:{" "}
                <span className="font-mono text-text">{aiCfg.masked_key ?? "•••"}</span>
              </span>
              <Button
                variant="ghost"
                onClick={() => void saveAIKey(true)}
                disabled={aiSaving}
                className="h-7 px-2 text-xs"
              >
                Eliminar
              </Button>
            </div>
          ) : (
            <p className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              Sin key configurada. La función "Sugerir con IA" devolverá 422.
            </p>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {aiCfg?.has_anthropic_api_key ? "Reemplazar key" : "Pegá tu API key"}
            </span>
            <input
              type="password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full rounded border border-border bg-surface px-2 py-1 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={() => void saveAIKey(false)}
              disabled={aiSaving || !aiKeyInput.trim()}
            >
              {aiSaving ? "Guardando…" : "Guardar key"}
            </Button>
            {aiMsg && (
              <span className={`text-xs ${aiMsg.ok ? "text-success" : "text-danger"}`}>
                {aiMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* ── Máquina CNC ─────────────────────────────────── */}
        <div className="mx-auto mt-6 max-w-lg rounded-lg border border-border bg-surface p-6">
          <h2 className="mb-1 text-sm font-medium text-muted uppercase tracking-wide">
            Máquina CNC
          </h2>
          <p className="mb-4 text-xs text-muted">
            Parámetros físicos de la máquina. Afectan el nesting y el cálculo de tiempo de corte.
          </p>
          <div className="space-y-4">
            <Field
              label="Diámetro de fresa / kerf"
              value={cfg.kerf_mm}
              onChange={patch("kerf_mm")}
              step={0.5}
              suffix="mm"
            />
            <Field
              label="Velocidad de corte"
              value={cfg.velocidad_corte_mm_min}
              onChange={patch("velocidad_corte_mm_min")}
              step={100}
              suffix="mm/min"
            />
          </div>
        </div>
        </>
      )}
    </div>
  );
}
