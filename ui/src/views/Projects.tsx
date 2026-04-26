import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Trash2, X, Search, Copy, ArrowUp, ArrowDown } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useProject } from "@/store/projectStore";
import type { ProjectMeta } from "@/lib/types";

type SortKey = "nombre" | "furniture_tipo" | "ancho" | "created_at";
type SortDir = "asc" | "desc";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function SortHeader({
  label, active, dir, onClick, align = "left",
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void; align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-text ${active ? "text-text" : ""}`}
      >
        {label}
        {active && (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}

export default function Projects() {
  const nav = useNavigate();
  const { setSpec, setResult, setActiveProjectName } = useProject();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; nombre: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? projects.filter((p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.furniture_tipo.toLowerCase().includes(q),
        )
      : projects;
    const sorted = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "nombre": av = a.nombre.toLowerCase(); bv = b.nombre.toLowerCase(); break;
        case "furniture_tipo": av = a.furniture_tipo; bv = b.furniture_tipo; break;
        case "ancho": av = a.ancho; bv = b.ancho; break;
        case "created_at": av = a.created_at; bv = b.created_at; break;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [projects, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "created_at" ? "desc" : "asc"); }
  };

  const onLoad = async (id: string) => {
    setError(null);
    try {
      const saved = await api.getProject(id);
      setSpec(saved.spec);
      setResult(saved.result);
      setActiveProjectName(saved.meta.nombre);
      nav("/nesting");
    } catch (e) {
      setError(String(e));
    }
  };

  const onDuplicate = async (id: string, nombre: string) => {
    setDuplicatingId(id);
    setError(null);
    try {
      const saved = await api.getProject(id);
      const copyName = `${nombre} (copia)`;
      await api.saveProject(copyName, saved.spec, saved.result);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setDuplicatingId(null);
    }
  };

  const onDelete = (id: string, nombre: string) => {
    setConfirmTarget({ id, nombre });
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(confirmTarget.id);
      setProjects((ps) => ps.filter((p) => p.id !== confirmTarget.id));
      setConfirmTarget(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Proyectos</h1>
          <p className="mt-0.5 text-xs text-muted">
            {projects.length} guardado{projects.length !== 1 ? "s" : ""}
            {query && ` · ${filtered.length} coincidencia${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre…"
              className="h-9 w-56 rounded border border-border bg-surface pl-7 pr-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <Button onClick={() => nav("/designer")}>
            <Plus size={16} /> Nuevo proyecto
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          Cargando…
        </div>
      ) : projects.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
            <FolderOpen size={22} />
          </div>
          <div>
            <p className="text-base font-medium text-text">Aún no hay proyectos</p>
            <p className="mt-1 text-sm text-muted">
              Diseñá tu primer mueble y guardalo desde Exportar.
            </p>
          </div>
          <Button variant="primary" onClick={() => nav("/designer")}>
            <Plus size={16} /> Crear primero
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          Sin coincidencias para "{query}".
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-muted">
              <tr>
                <SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} />
                <SortHeader label="Tipo" active={sortKey === "furniture_tipo"} dir={sortDir} onClick={() => toggleSort("furniture_tipo")} />
                <SortHeader label="Dimensiones" active={sortKey === "ancho"} dir={sortDir} onClick={() => toggleSort("ancho")} />
                <SortHeader label="Creado" active={sortKey === "created_at"} dir={sortDir} onClick={() => toggleSort("created_at")} />
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{p.nombre}</td>
                  <td className="px-4 py-2 text-muted">{p.furniture_tipo}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">
                    {p.ancho}×{p.alto}×{p.profundidad} mm
                  </td>
                  <td className="px-4 py-2 text-muted">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => onLoad(p.id)}>
                        <FolderOpen size={14} /> Cargar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void onDuplicate(p.id, p.nombre)}
                        disabled={duplicatingId === p.id}
                        title="Duplicar proyecto"
                      >
                        <Copy size={14} />
                        {duplicatingId === p.id ? "…" : ""}
                      </Button>
                      <Button variant="danger" onClick={() => onDelete(p.id, p.nombre)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmTarget(null); }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-delete-title"
              className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 id="confirm-delete-title" className="text-sm font-semibold text-text">
                  Eliminar proyecto
                </h2>
                <button
                  onClick={() => setConfirmTarget(null)}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="px-5 py-4 text-sm text-text">
                <p>
                  ¿Eliminar el proyecto{" "}
                  <span className="font-semibold">"{confirmTarget.nombre}"</span>?
                </p>
                <p className="mt-1 text-xs text-muted">Esta acción no se puede deshacer.</p>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="ghost" onClick={() => setConfirmTarget(null)} disabled={deleting}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}>
                  {deleting ? "Eliminando…" : "Eliminar"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
