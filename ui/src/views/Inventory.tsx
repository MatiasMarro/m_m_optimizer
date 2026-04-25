import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, X, Check } from "lucide-react";
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
  const [addOpen, setAddOpen] = useState(false);
  const [newAncho, setNewAncho] = useState("");
  const [newAlto, setNewAlto] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

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

  const onAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ancho = parseFloat(newAncho);
    const alto = parseFloat(newAlto);
    if (!ancho || !alto || ancho < 1 || alto < 1) {
      setAddError("Ingresá dimensiones válidas (mm)");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      await api.addOffcut(ancho, alto);
      setNewAncho("");
      setNewAlto("");
      setAddOpen(false);
      await load();
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAddLoading(false);
    }
  };

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
          <Button variant="secondary" onClick={() => { setAddOpen((v) => !v); setAddError(null); }}>
            {addOpen ? <X size={16} /> : <Plus size={16} />}
            {addOpen ? "Cancelar" : "Agregar retazo"}
          </Button>
        </div>
      </div>

      {addOpen && (
        <form
          onSubmit={(e) => void onAddSubmit(e)}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Ancho (mm)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={newAncho}
              onChange={(e) => setNewAncho(e.target.value)}
              placeholder="600"
              className="w-28 rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Alto (mm)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={newAlto}
              onChange={(e) => setNewAlto(e.target.value)}
              placeholder="400"
              className="w-28 rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={addLoading}>
              <Check size={16} /> {addLoading ? "Guardando…" : "Guardar"}
            </Button>
            {addError && <span className="text-xs text-danger">{addError}</span>}
          </div>
        </form>
      )}

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
