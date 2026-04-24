import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileBox, Play, Trash2, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import InspectorPanel from "@/components/layout/InspectorPanel";
import { useProject } from "@/store/projectStore";
import { api, type FurnitureItem } from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────

function NumberField({
  label, value, onChange, step = 10, suffix = "mm",
}: {
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

function TabButton({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 pb-2 pt-1 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

// ─── furniture card ───────────────────────────────────────────────────────────

function FurnitureCard({
  item, onDelete,
}: {
  item: FurnitureItem; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
      {/* thumbnail */}
      <div className="relative aspect-square w-full bg-surface-2">
        {thumbError ? (
          <div className="flex h-full items-center justify-center text-muted">
            <FileBox size={40} strokeWidth={1.5} />
          </div>
        ) : (
          <img
            src={item.thumbnail_url}
            alt={item.name}
            className="h-full w-full object-contain p-3"
            onError={() => setThumbError(true)}
          />
        )}
      </div>

      {/* info */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="truncate font-medium leading-tight" title={item.name}>
          {item.name}
        </p>
        <p className="text-xs text-muted">
          {item.contours_count} contorno{item.contours_count !== 1 ? "s" : ""}
        </p>
        {item.layers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.layers.slice(0, 4).map((l) => (
              <span
                key={l}
                title={l}
                className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted"
              >
                {l.length > 12 ? `${l.slice(0, 12)}…` : l}
              </span>
            ))}
            {item.layers.length > 4 && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                +{item.layers.length - 4}
              </span>
            )}
          </div>
        )}
        <p className="mt-auto pt-1 text-xs text-muted">{relativeTime(item.created_at)}</p>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <Button variant="secondary" className="flex-1 justify-center text-xs" disabled>
          Asignar roles
        </Button>
        {confirmDelete ? (
          <div className="flex gap-1">
            <Button
              variant="danger"
              className="h-8 px-2 text-xs"
              onClick={() => { setConfirmDelete(false); onDelete(); }}
            >
              Confirmar
            </Button>
            <Button
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              ✕
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            title="Eliminar"
            className="flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Designer ─────────────────────────────────────────────────────────────────

export default function Designer() {
  const nav = useNavigate();
  const { spec, setSpec, setResult, setLoading, setError, loading } = useProject();

  // ── tabs
  const [activeTab, setActiveTab] = useState<"parametric" | "dxf">("parametric");

  // ── dxf list
  const [furnitureList, setFurnitureList] = useState<FurnitureItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // ── import form
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");
  const [importThickness, setImportThickness] = useState(18);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "dxf") void loadFurniture();
  }, [activeTab]);

  async function loadFurniture() {
    setListLoading(true);
    try {
      setFurnitureList(await api.listFurniture());
    } catch {
      // empty list is fine
    } finally {
      setListLoading(false);
    }
  }

  function handleFileSelected(file: File) {
    if (!file.name.toLowerCase().endsWith(".dxf")) {
      setUploadError("Solo se aceptan archivos .dxf");
      return;
    }
    setUploadError(null);
    setPendingFile(file);
    if (!importName) setImportName(file.name.replace(/\.dxf$/i, ""));
  }

  async function handleImport() {
    if (!pendingFile || !importName.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await api.importFurniture(importName.trim(), importThickness, pendingFile);
      setPendingFile(null);
      setImportName("");
      await loadFurniture();
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteFurniture(id);
      setFurnitureList((prev) => prev.filter((f) => f.furniture_id !== id));
    } catch {
      // ignore — item remains in list
    }
  }

  async function onOptimize() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runPipeline({ furniture: spec, use_inventory: false, export_dxf: false });
      setResult(res);
      nav("/nesting");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // ── drop zone
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }

  const hasItems = furnitureList.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 items-end gap-1 border-b border-border px-6">
        <TabButton active={activeTab === "parametric"} onClick={() => setActiveTab("parametric")}>
          Paramétrico
        </TabButton>
        <TabButton active={activeTab === "dxf"} onClick={() => setActiveTab("dxf")}>
          Desde DXF
        </TabButton>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Main area ── */}
        <div className="min-w-0 flex-1 overflow-auto p-6">

          {/* Parametric tab */}
          {activeTab === "parametric" && (
            <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
              Preview 3D · TODO
            </div>
          )}

          {/* DXF tab */}
          {activeTab === "dxf" && (
            <div className="flex flex-col gap-5">
              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5 text-primary"
                    : pendingFile
                    ? "border-success bg-success/5 text-success"
                    : "border-border text-muted hover:border-primary/40 hover:text-text"
                } ${hasItems ? "py-5" : "py-16"}`}
              >
                <Upload size={hasItems ? 18 : 28} strokeWidth={1.5} />
                {pendingFile ? (
                  <p className="text-sm font-medium">{pendingFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {isDragging ? "Soltá el archivo aquí" : "Arrastrá un DXF o hacé clic para seleccionar"}
                    </p>
                    {!hasItems && (
                      <p className="text-xs opacity-70">Exportado desde Vectric Aspire · .dxf</p>
                    )}
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = "";
                }}
              />

              {/* Furniture grid */}
              {listLoading ? (
                <p className="py-10 text-center text-sm text-muted">Cargando…</p>
              ) : hasItems ? (
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                  {furnitureList.map((item) => (
                    <FurnitureCard
                      key={item.furniture_id}
                      item={item}
                      onDelete={() => void handleDelete(item.furniture_id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted">
                  No hay muebles importados todavía.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Inspector panel ── */}
        <InspectorPanel title={activeTab === "parametric" ? "Parámetros" : "Importar DXF"}>
          {activeTab === "parametric" ? (
            <>
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
              <NumberField
                label="Profundidad"
                value={spec.profundidad}
                onChange={(profundidad) => setSpec({ profundidad })}
              />
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
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <span className="mb-1 block text-xs text-muted">Nombre del mueble</span>
                <input
                  type="text"
                  placeholder="ej. Mesa comedor"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                />
              </div>
              <NumberField
                label="Espesor material"
                value={importThickness}
                onChange={setImportThickness}
                step={1}
              />
              {uploadError && (
                <p className="rounded bg-danger/10 px-3 py-2 text-xs text-danger">
                  {uploadError}
                </p>
              )}
              <Button
                onClick={() => void handleImport()}
                disabled={!pendingFile || !importName.trim() || uploading}
                className="w-full justify-center"
              >
                <Upload size={16} />
                {uploading ? "Importando…" : pendingFile ? "Importar DXF" : "Seleccioná un archivo"}
              </Button>
              {!pendingFile && (
                <p className="text-center text-xs text-muted">
                  Arrastrá un DXF al área principal o hacé clic en la zona de drop.
                </p>
              )}
            </div>
          )}
        </InspectorPanel>
      </div>
    </div>
  );
}

