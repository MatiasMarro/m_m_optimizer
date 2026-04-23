import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Trash2 } from "lucide-react";
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
  const { setSpec, setResult } = useProject();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      nav("/nesting");
    } catch (e) {
      setError(String(e));
    }
  };

  const onDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el proyecto "${nombre}"?`)) return;
    setError(null);
    try {
      await api.deleteProject(id);
      setProjects((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="p-6">
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
    </div>
  );
}
