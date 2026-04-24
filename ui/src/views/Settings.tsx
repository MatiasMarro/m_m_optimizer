import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { CostingConfig } from "@/lib/types";
import Button from "@/components/ui/Button";

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
  const [cfg, setCfg] = useState<CostingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then((raw) => setCfg({ ...raw, margen: raw.margen * 100 }))
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  }, []);

  const patch =
    (key: keyof CostingConfig) => (val: number) =>
      setCfg((prev) => (prev ? { ...prev, [key]: val } : prev));

  const save = async () => {
    if (!cfg) return;
    setLoading(true);
    setMsg(null);
    try {
      await api.putConfig({ ...cfg, margen: cfg.margen / 100 });
      setMsg({ ok: true, text: "Guardado correctamente" });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
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
