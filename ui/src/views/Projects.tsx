import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Plus, FolderOpen, Trash2, X, Search, Copy,
  ArrowUp, ArrowDown, Star, StarOff, Pencil, StickyNote, Image as ImageIcon,
} from "lucide-react";
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
  const [editTarget, setEditTarget] = useState<ProjectMeta | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [onlyFav, setOnlyFav] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

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

  const allTags = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => (p.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects;
    if (onlyFav) list = list.filter((p) => p.favorito);
    if (tagFilter) list = list.filter((p) => (p.tags ?? []).includes(tagFilter));
    if (q) {
      list = list.filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.furniture_tipo.toLowerCase().includes(q) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
        (p.notas ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      // Favoritos siempre primero (estable)
      const af = a.favorito ? 1 : 0;
      const bf = b.favorito ? 1 : 0;
      if (af !== bf) return bf - af;
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
  }, [projects, query, sortKey, sortDir, onlyFav, tagFilter]);

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
      const meta = await api.saveProject(copyName, saved.spec, saved.result);
      // Copiar tags/notas/fotos de la fuente al nuevo proyecto
      const src = saved.meta;
      const carry: typeof src = { ...src };
      if ((carry.tags?.length ?? 0) || (carry.notas ?? "") || (carry.foto_urls?.length ?? 0)) {
        try {
          await api.patchProjectMeta(meta.id, {
            tags: carry.tags ?? [],
            notas: carry.notas ?? "",
            foto_urls: carry.foto_urls ?? [],
          });
        } catch {
          // si falla el patch, el proyecto duplicado queda igualmente
        }
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setDuplicatingId(null);
    }
  };

  const toggleFav = async (p: ProjectMeta) => {
    const next = !p.favorito;
    setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, favorito: next } : x)));
    try {
      await api.patchProjectMeta(p.id, { favorito: next });
    } catch (e) {
      // revert
      setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, favorito: !next } : x)));
      setError(String(e));
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
            {(query || onlyFav || tagFilter) &&
              ` · ${filtered.length} coincidencia${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nombre, tag o nota…"
              className="h-9 w-64 rounded border border-border bg-surface pl-7 pr-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <Button onClick={() => nav("/designer")}>
            <Plus size={16} /> Nuevo proyecto
          </Button>
        </div>
      </div>

      {(allTags.length > 0 || projects.some((p) => p.favorito)) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setOnlyFav((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
              onlyFav
                ? "border-warning bg-warning/10 text-warning"
                : "border-border text-muted hover:bg-surface-2"
            }`}
            title="Mostrar solo favoritos"
          >
            <Star size={12} fill={onlyFav ? "currentColor" : "none"} />
            Favoritos
          </button>
          {allTags.length > 0 && (
            <>
              <span className="text-muted">·</span>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={`rounded-full border px-2 py-0.5 ${
                    tagFilter === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:bg-surface-2"
                  }`}
                >
                  #{t}
                </button>
              ))}
              {tagFilter && (
                <button
                  onClick={() => setTagFilter(null)}
                  className="text-muted hover:text-text"
                  aria-label="Limpiar filtro"
                >
                  <X size={11} />
                </button>
              )}
            </>
          )}
        </div>
      )}

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
          Sin coincidencias para los filtros activos.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-muted">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} />
                <th className="px-4 py-2">Tags</th>
                <SortHeader label="Tipo" active={sortKey === "furniture_tipo"} dir={sortDir} onClick={() => toggleSort("furniture_tipo")} />
                <SortHeader label="Dimensiones" active={sortKey === "ancho"} dir={sortDir} onClick={() => toggleSort("ancho")} />
                <SortHeader label="Creado" active={sortKey === "created_at"} dir={sortDir} onClick={() => toggleSort("created_at")} />
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const tags = p.tags ?? [];
                const notesCount = (p.notas ?? "").trim().length;
                const photosCount = (p.foto_urls ?? []).length;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => void toggleFav(p)}
                        aria-label={p.favorito ? "Quitar de favoritos" : "Marcar como favorito"}
                        title={p.favorito ? "Favorito" : "Marcar favorito"}
                        className="text-muted hover:text-warning"
                      >
                        {p.favorito ? (
                          <Star size={14} className="text-warning" fill="currentColor" />
                        ) : (
                          <StarOff size={14} />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{p.nombre}</span>
                        {notesCount > 0 && (
                          <span title={`${notesCount} caracteres en notas`}>
                            <StickyNote size={11} className="text-muted" />
                          </span>
                        )}
                        {photosCount > 0 && (
                          <span title={`${photosCount} foto${photosCount !== 1 ? "s" : ""}`}>
                            <ImageIcon size={11} className="text-muted" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {tags.length === 0 ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                            >
                              {t}
                            </span>
                          ))}
                          {tags.length > 4 && (
                            <span className="text-[10px] text-muted">+{tags.length - 4}</span>
                          )}
                        </div>
                      )}
                    </td>
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
                          onClick={() => setEditTarget(p)}
                          title="Editar tags y notas"
                        >
                          <Pencil size={14} />
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
                );
              })}
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

      {editTarget && (
        <EditMetaModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setProjects((ps) => ps.map((x) => (x.id === updated.id ? updated : x)));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Edit meta modal ──────────────────────────────────────────────────────────

function EditMetaModal({
  target, onClose, onSaved,
}: {
  target: ProjectMeta;
  onClose: () => void;
  onSaved: (m: ProjectMeta) => void;
}) {
  const [nombre, setNombre] = useState(target.nombre);
  const [tagsRaw, setTagsRaw] = useState((target.tags ?? []).join(", "));
  const [notas, setNotas] = useState(target.notas ?? "");
  const [fotos, setFotos] = useState<string[]>(target.foto_urls ?? []);
  const [newFoto, setNewFoto] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addFoto = () => {
    const u = newFoto.trim();
    if (!u) return;
    setFotos((arr) => [...arr, u]);
    setNewFoto("");
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1_500_000) {
      setErr("La imagen es muy grande (máx ~1.5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data === "string") setFotos((arr) => [...arr, data]);
    };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const updated = await api.patchProjectMeta(target.id, {
        nombre: nombre.trim() || target.nombre,
        tags,
        notas,
        foto_urls: fotos,
      });
      onSaved(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-meta-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="edit-meta-title" className="text-sm font-semibold">
            Editar proyecto
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-auto px-5 py-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              Tags (separados por coma)
            </span>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="cliente-juan, urgente, prototipo"
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Notas</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              placeholder="Observaciones de obra, herrajes especiales, contacto…"
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <div>
            <span className="mb-1 block text-xs text-muted">
              Fotos de referencia
            </span>
            <div className="flex flex-col gap-2">
              {fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fotos.map((url, i) => (
                    <div key={i} className="group relative h-20 w-20 overflow-hidden rounded border border-border">
                      <img src={url} alt={`ref ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        onClick={() => setFotos((arr) => arr.filter((_, j) => j !== i))}
                        className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center bg-black/60 text-white group-hover:flex"
                        aria-label="Quitar foto"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newFoto}
                  onChange={(e) => setNewFoto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFoto(); } }}
                  placeholder="https://… o pegá URL"
                  className="flex-1 min-w-[180px] rounded border border-border bg-surface px-2 py-1 text-xs"
                />
                <Button variant="ghost" onClick={addFoto} className="text-xs">
                  <Plus size={12} /> URL
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs text-muted hover:bg-surface-2">
                  <ImageIcon size={12} /> Subir
                  <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
                </label>
              </div>
            </div>
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
