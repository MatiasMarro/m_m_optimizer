import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import { api, type OffcutStock } from "@/lib/api";

const THUMB_W = 180;
const THUMB_H = 120;

function OffcutThumb({ o }: { o: OffcutStock }) {
  const scale = Math.min(THUMB_W / o.width, THUMB_H / o.height);
  const w = o.width * scale;
  const h = o.height * scale;
  const area = (o.width * o.height) / 1_000_000;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div
        className="flex items-center justify-center rounded bg-surface-2"
        style={{ height: THUMB_H + 16 }}
      >
        <div
          className="border border-offcut bg-offcut/20"
          style={{ width: w, height: h }}
          aria-label={`retazo ${o.id}`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold">{o.id}</span>
        <span className="text-xs text-muted">{area.toFixed(2)} m²</span>
      </div>
      <div className="font-mono text-xs text-muted">
        {o.width} × {o.height} · {o.thickness}mm
      </div>
    </div>
  );
}

export default function Inventory() {
  const [items, setItems] = useState<OffcutStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.listOffcuts());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const areaMm2 = items.reduce((acc, o) => acc + o.width * o.height, 0);
    return { count: items.length, areaM2: areaMm2 / 1_000_000 };
  }, [items]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inventario de retazos</h1>
          <div className="mt-1 text-sm text-muted">
            {totals.count} piezas · {totals.areaM2.toFixed(2)} m² disponibles
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Recargar
          </Button>
          <Button variant="secondary"><Plus size={16} /> Agregar retazo</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-danger bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {items.length === 0 && !loading ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          Sin retazos en stock.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {items.map((o) => <OffcutThumb key={o.id} o={o} />)}
        </div>
      )}
    </div>
  );
}
