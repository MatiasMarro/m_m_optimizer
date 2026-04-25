import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useProject } from "@/store/projectStore";
import type { ProjectMeta } from "@/lib/types";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function Projects() {
  const nav = useNavigate();
  const { setSpec, setResult, setActiveProjectName } = useProject();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; nombre: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    refresh();
  }, []);

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

  const onDelete = async (id: string, nombre: string) => {
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proyectos</h1>
        <Button onClick={() => nav("/designer")}>
          <Plus size={16} /> Nuevo proyecto
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          Cargando…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          Aún no hay proyectos. Crea el primero.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Dimensiones</th>
                <th className="px-4 py-2">Creado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
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