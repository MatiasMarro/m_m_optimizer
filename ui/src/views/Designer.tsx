import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileBox, Play, Search, Trash2, Upload, Wand2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import InspectorPanel from "@/components/layout/InspectorPanel";
import RoleWizardModal from "@/components/RoleWizardModal";
import DxfPreview from "@/components/DxfPreview";
import StageProgress, { OPTIMIZE_STAGES } from "@/components/StageProgress";
import { useProject } from "@/store/projectStore";
import { api, Crv3dNotSupportedError, type Crv3dMetadata, type FurnitureItem } from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────

function NumberField({
  label, value, onChange, step = 10, suffix = "mm", min, max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  const outOfRange =
    (min !== undefined && value < min) || (max !== undefined && value > max);
  const errMsg = outOfRange
    ? min !== undefined && max !== undefined
      ? `Debe estar entre ${min} y ${max} ${suffix}`
      : min !== undefined
      ? `Mínimo ${min} ${suffix}`
      : `Máximo ${max} ${suffix}`
    : null;

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full rounded border bg-surface px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 ${
            outOfRange
              ? "border-danger focus:ring-danger/40"
              : "border-border focus:ring-primary/40"
          }`}
          aria-invalid={outOfRange}
        />
        <span className="text-xs text-muted">{suffix}</span>
      </div>
      {errMsg && <span className="mt-1 block text-[11px] text-danger">{errMsg}</span>}
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
  item, onDelete, onOpenRoles, onOpenPreview, onOptimize, optimizing,
}: {
  item: FurnitureItem;
  onDelete: () => void;
  onOpenRoles: () => void;
  onOpenPreview: () => void;
  onOptimize: () => void;
  optimizing: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const hasRoles = Object.values(item.piece_roles).some((r) => r !== "");

  return (
    <div
      onClick={onOpenPreview}
      className="flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:border-primary/40 hover:shadow-md"
    >
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
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-1.5 border-t border-border px-3 py-2"
      >
        <Button
          variant="primary"
          className="w-full justify-center text-xs"
          onClick={onOptimize}
          disabled={optimizing}
          title="Convierte los contornos PROFILE a piezas y corre el nesting"
        >
          {optimizing ? (
            <StageProgress active stages={OPTIMIZE_STAGES} className="text-white" />
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Wand2 size={12} /> Optimizar mueble
            </span>
          )}
        </Button>
        <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="flex-1 justify-center text-xs"
          onClick={onOpenRoles}
        >
          {hasRoles && (
            <CheckCircle2 size={12} className="text-success" />
          )}
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
    </div>
  );
}

// ─── Designer ─────────────────────────────────────────────────────────────────

export default function Designer() {
  const nav = useNavigate();
  const {
    spec, setSpec, setResult, setLoading, setError, loading,
    setInventoryComparison, setActiveProjectName,
  } = useProject();

  // ── tabs
  const [activeTab, setActiveTab] = useState<"parametric" | "dxf">("parametric");

  // ── dxf list
  const [furnitureList, setFurnitureList] = useState<FurnitureItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [furnitureQuery, setFurnitureQuery] = useState("");
  const [furnitureFilter, setFurnitureFilter] = useState<"all" | "ready" | "pending">("all");

  // ── role wizard modal
  const [wizardItem, setWizardItem] = useState<FurnitureItem | null>(null);

  // ── optimize state
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  // ── crv3d info modal
  const [crv3dInfo, setCrv3dInfo] = useState<{
    fileName: string;
    metadata: Crv3dMetadata;
    previewGifBase64: string | null;
  } | null>(null);

  // ── preview modal
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const selectedFurniture =
    furnitureList.find((f) => f.furniture_id === selectedFurnitureId) ?? null;

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

  useEffect(() => {
    if (!selectedFurnitureId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFurnitureId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedFurnitureId]);

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
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".dxf") && !lower.endsWith(".crv3d")) {
      setUploadError("Solo se aceptan archivos .dxf o .crv3d");
      return;
    }
    setUploadError(null);
    setPendingFile(file);
    if (!importName) setImportName(file.name.replace(/\.(dxf|crv3d)$/i, ""));
  }

  function isNetworkError(e: unknown): boolean {
    if (!(e instanceof Error)) return false;
    const m = e.message.toLowerCase();
    return (
      m.includes("failed to fetch") ||
      m.includes("network") ||
      m.includes("load failed") ||
      m.includes("connection")
    );
  }

  function friendlyImportError(e: unknown): string {
    if (!(e instanceof Error)) return String(e);
    const m = e.message;
    if (isNetworkError(e)) {
      return "No se pudo conectar con el servidor. Verificá que esté corriendo.";
    }
    if (m.includes("400")) {
      return "El archivo parece inválido o está corrupto. Probá exportarlo de nuevo.";
    }
    if (m.includes("422")) {
      return "El formato del archivo no es soportado.";
    }
    if (m.includes("500")) {
      return "Error interno del servidor al procesar el archivo. Intentá de nuevo.";
    }
    return m;
  }

  async function tryImport(file: File, name: string, thickness: number, attempt = 0): Promise<void> {
    try {
      await api.importFurniture(name, thickness, file);
    } catch (e) {
      if (e instanceof Crv3dNotSupportedError) throw e;
      if (attempt < 1 && isNetworkError(e)) {
        await new Promise((r) => setTimeout(r, 1500));
        return tryImport(file, name, thickness, attempt + 1);
      }
      throw e;
    }
  }

  async function handleImport() {
    if (!pendingFile || !importName.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await tryImport(pendingFile, importName.trim(), importThickness);
      setPendingFile(null);
      setImportName("");
      await loadFurniture();
    } catch (e) {
      if (e instanceof Crv3dNotSupportedError) {
        setCrv3dInfo({
          fileName: pendingFile.name,
          metadata: e.metadata,
          previewGifBase64: e.previewGifBase64,
        });
        setPendingFile(null);
        setImportName("");
      } else {
        setUploadError(friendlyImportError(e));
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteFurniture(id);
      setFurnitureList((prev) => prev.filter((f) => f.furniture_id !== id));
      if (selectedFurnitureId === id) setSelectedFurnitureId(null);
    } catch {
      // ignore — item remains in list
    }
  }

  async function handleOptimizeImported(item: FurnitureItem) {
    setOptimizingId(item.furniture_id);
    setOptimizeError(null);
    setInventoryComparison(null);
    try {
      const res = await api.optimizeImported(item.furniture_id, {
        compare_inventory: true,
      });
      const chosen = res.with_inventory ?? res.result;
      if (!chosen) throw new Error("Respuesta sin layout");
      setResult(chosen);
      if (res.compare && res.summary) {
        setInventoryComparison({
          fileName: item.name,
          sheetsWithout: res.summary.sheets_without ?? 0,
          sheetsWith: res.summary.sheets_with ?? 0,
          offcutsUsed: res.summary.offcuts_used ?? 0,
          savingsArs: res.summary.savings_ars ?? 0,
          savingsPct: res.summary.savings_pct ?? 0,
          layoutWithout: res.without_inventory?.layout.sheets_used ?? null,
          layoutWith: res.with_inventory?.layout.sheets_used ?? null,
        });
      }
      setActiveProjectName(item.name);
      nav("/nesting");
    } catch (e) {
      setOptimizeError(e instanceof Error ? e.message : String(e));
    } finally {
      setOptimizingId(null);
    }
  }

  async function onOptimize() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runPipeline({ furniture: spec, use_inventory: false, export_dxf: true });
      setResult(res);
      const name =
        spec.tipo === "shelving"
          ? `Estantería ${spec.ancho}×${spec.alto}`
          : `Mueble ${spec.ancho}×${spec.alto}`;
      setActiveProjectName(name);
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

  const filteredFurniture = useMemo(() => {
    const q = furnitureQuery.trim().toLowerCase();
    return furnitureList.filter((f) => {
      if (q && !f.name.toLowerCase().includes(q)) return false;
      if (furnitureFilter !== "all") {
        const layers = f.layers ?? [];
        const assigned = layers.filter((l) => f.piece_roles?.[l]).length;
        const ready = layers.length > 0 && assigned === layers.length;
        if (furnitureFilter === "ready" && !ready) return false;
        if (furnitureFilter === "pending" && ready) return false;
      }
      return true;
    });
  }, [furnitureList, furnitureQuery, furnitureFilter]);

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
              {optimizeError && (
                <div className="flex items-start gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <span className="font-medium">Error al optimizar:</span>
                  <span>{optimizeError}</span>
                  <button
                    onClick={() => setOptimizeError(null)}
                    className="ml-auto opacity-60 hover:opacity-100"
                    aria-label="Cerrar"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
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
                      {isDragging ? "Soltá el archivo aquí" : "Arrastrá un DXF o .crv3d, o hacé clic para seleccionar"}
                    </p>
                    {!hasItems && (
                      <p className="text-xs opacity-70">
                        Vectric Aspire · .dxf (recomendado) o .crv3d (mostramos metadata)
                      </p>
                    )}
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf,.crv3d"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = "";
                }}
              />

              {/* Filtros + grid */}
              {listLoading ? (
                <p className="py-10 text-center text-sm text-muted">Cargando…</p>
              ) : hasItems ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative">
                      <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        value={furnitureQuery}
                        onChange={(e) => setFurnitureQuery(e.target.value)}
                        placeholder="Buscar mueble por nombre…"
                        className="h-9 w-64 rounded border border-border bg-surface pl-7 pr-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div className="inline-flex overflow-hidden rounded border border-border text-xs">
                      {(["all", "ready", "pending"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFurnitureFilter(f)}
                          className={`px-3 py-1.5 transition-colors ${
                            furnitureFilter === f
                              ? "bg-primary text-white"
                              : "bg-surface text-muted hover:bg-surface-2 hover:text-text"
                          }`}
                        >
                          {f === "all" ? "Todos" : f === "ready" ? "Roles listos" : "Sin asignar"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredFurniture.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted">
                      Sin coincidencias con los filtros aplicados.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredFurniture.map((item) => (
                        <FurnitureCard
                          key={item.furniture_id}
                          item={item}
                          onDelete={() => void handleDelete(item.furniture_id)}
                          onOpenRoles={() => setWizardItem(item)}
                          onOpenPreview={() => setSelectedFurnitureId(item.furniture_id)}
                          onOptimize={() => void handleOptimizeImported(item)}
                          optimizing={optimizingId === item.furniture_id}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="py-4 text-center text-sm text-muted">
                  No hay muebles importados todavía. Arrastrá un archivo arriba para empezar.
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
              <NumberField
                label="Ancho"
                value={spec.ancho}
                onChange={(ancho) => setSpec({ ancho })}
                min={50}
                max={3000}
              />
              <NumberField
                label="Alto"
                value={spec.alto}
                onChange={(alto) => setSpec({ alto })}
                min={50}
                max={3000}
              />
              <NumberField
                label="Profundidad"
                value={spec.profundidad}
                onChange={(profundidad) => setSpec({ profundidad })}
                min={50}
                max={1500}
              />
              <NumberField
                label="Estantes"
                value={spec.num_estantes ?? 0}
                onChange={(num_estantes) => setSpec({ num_estantes })}
                step={1}
                suffix=""
                min={0}
                max={20}
              />
              {(() => {
                const invalid =
                  spec.ancho < 50 || spec.ancho > 3000 ||
                  spec.alto < 50 || spec.alto > 3000 ||
                  spec.profundidad < 50 || spec.profundidad > 1500 ||
                  (spec.num_estantes ?? 0) < 0 || (spec.num_estantes ?? 0) > 20;
                return (
                  <Button
                    onClick={onOptimize}
                    disabled={loading || invalid}
                    className="w-full justify-center"
                    title={invalid ? "Corregí las dimensiones fuera de rango" : undefined}
                  >
                    {loading ? (
                      <StageProgress active stages={OPTIMIZE_STAGES} className="text-white" />
                    ) : (
                      <>
                        <Play size={16} /> Optimizar
                      </>
                    )}
                  </Button>
                );
              })()}
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
                <div className="flex flex-col gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <p>{uploadError}</p>
                  {pendingFile && (
                    <button
                      type="button"
                      onClick={() => void handleImport()}
                      className="self-start rounded border border-danger/40 px-2 py-0.5 text-[11px] font-medium hover:bg-danger/20"
                    >
                      Reintentar
                    </button>
                  )}
                </div>
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

      {/* Role wizard modal */}
      {wizardItem && (
        <RoleWizardModal
          furnitureId={wizardItem.furniture_id}
          furnitureName={wizardItem.name}
          layers={wizardItem.layers}
          initialRoles={wizardItem.piece_roles}
          layerDepths={wizardItem.layer_depths}
          onClose={() => setWizardItem(null)}
          onSaved={() => void loadFurniture()}
        />
      )}

      {/* Preview modal */}
      {selectedFurniture &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedFurnitureId(null);
            }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dxf-preview-title"
              className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2
                    id="dxf-preview-title"
                    className="truncate text-sm font-semibold text-text"
                    title={selectedFurniture.name}
                  >
                    {selectedFurniture.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {selectedFurniture.contours_count} contorno
                    {selectedFurniture.contours_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFurnitureId(null)}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex flex-1 items-stretch justify-center overflow-hidden p-4">
                <DxfPreview
                  furnitureId={selectedFurniture.furniture_id}
                  className="aspect-square w-full max-w-[70vh]"
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* .crv3d info modal */}
      {crv3dInfo &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCrv3dInfo(null);
            }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="crv3d-info-title"
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2 id="crv3d-info-title" className="truncate text-sm font-semibold text-text">
                    Archivo .crv3d detectado
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-muted" title={crv3dInfo.fileName}>
                    {crv3dInfo.fileName}
                  </p>
                </div>
                <button
                  onClick={() => setCrv3dInfo(null)}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex flex-col gap-4 overflow-auto p-5">
                <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-text">
                  <p className="font-medium">El formato nativo de Aspire no es parseable.</p>
                  <p className="mt-1 text-muted">
                    Exportá como DXF desde Aspire:{" "}
                    <span className="font-mono text-text">File → Export → Vectors as DXF</span>{" "}
                    y volvé a importar el .dxf.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                  {crv3dInfo.previewGifBase64 ? (
                    <img
                      src={`data:image/gif;base64,${crv3dInfo.previewGifBase64}`}
                      alt="Preview Aspire"
                      className="h-40 w-40 rounded border border-border bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-40 w-40 items-center justify-center rounded border border-dashed border-border text-xs text-muted">
                      sin preview
                    </div>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 self-start text-xs">
                    <dt className="text-muted">Versión</dt>
                    <dd className="font-mono text-text">
                      {crv3dInfo.metadata.aspire_version ?? "—"}
                    </dd>
                    <dt className="text-muted">Material</dt>
                    <dd className="font-mono text-text">
                      {crv3dInfo.metadata.material_width_mm && crv3dInfo.metadata.material_height_mm
                        ? `${crv3dInfo.metadata.material_width_mm} × ${crv3dInfo.metadata.material_height_mm} mm`
                        : "—"}
                    </dd>
                    <dt className="text-muted">Espesor</dt>
                    <dd className="font-mono text-text">
                      {crv3dInfo.metadata.material_thickness_mm
                        ? `${crv3dInfo.metadata.material_thickness_mm} mm`
                        : "—"}
                    </dd>
                    <dt className="text-muted">Layers</dt>
                    <dd className="text-text">
                      {crv3dInfo.metadata.layer_names.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {crv3dInfo.metadata.layer_names.map((n) => (
                            <span
                              key={n}
                              className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
              <div className="flex justify-end border-t border-border px-5 py-3">
                <Button variant="primary" onClick={() => setCrv3dInfo(null)}>
                  Entendido
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

