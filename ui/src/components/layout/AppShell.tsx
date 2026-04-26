import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { RefreshCw, WifiOff, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useProject } from "@/store/projectStore";
import { useServer } from "@/store/serverStore";
import TopBar from "./TopBar";
import RailNav from "./RailNav";
import StatusBar from "./StatusBar";

const GUARDED_ROUTE = "/designer";

const SHORTCUTS: { keys: string; label: string; group: string }[] = [
  { keys: "g d", label: "Ir al Diseñador", group: "Navegación" },
  { keys: "g n", label: "Ir a Nesting", group: "Navegación" },
  { keys: "g c", label: "Ir a Costos", group: "Navegación" },
  { keys: "g e", label: "Ir a Exportar", group: "Navegación" },
  { keys: "g p", label: "Ir a Proyectos", group: "Navegación" },
  { keys: "g i", label: "Ir a Inventario", group: "Navegación" },
  { keys: "g h", label: "Ir al Dashboard", group: "Navegación" },
  { keys: "g s", label: "Ir a Ajustes", group: "Navegación" },
  { keys: "Ctrl+N", label: "Nuevo proyecto (descarta el activo)", group: "Acciones" },
  { keys: "Ctrl+S", label: "Guardar (en Exportar)", group: "Acciones" },
  { keys: "Ctrl+Z", label: "Deshacer último drag (en Nesting)", group: "Acciones" },
  { keys: "+ / -", label: "Zoom in / out (en Nesting)", group: "Acciones" },
  { keys: "F", label: "Encuadrar layout (en Nesting)", group: "Acciones" },
  { keys: "?", label: "Mostrar este panel", group: "General" },
  { keys: "Esc", label: "Cerrar diálogos", group: "General" },
];

const ROUTE_BY_KEY: Record<string, string> = {
  d: "/designer",
  n: "/nesting",
  c: "/costs",
  e: "/export",
  p: "/projects",
  i: "/inventory",
  h: "/",
  s: "/settings",
};

export default function AppShell() {
  const { activeProjectName, reset, undoMove, result } = useProject();
  const { online: serverOnline, checking: serverChecking, checkNow: serverCheckNow } = useServer();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const gPrefixTimer = useRef<number | null>(null);
  const gPending = useRef(false);

  const onIntercept = (route: string): boolean => {
    if (
      route === GUARDED_ROUTE &&
      activeProjectName !== null &&
      pathname !== GUARDED_ROUTE
    ) {
      setPendingRoute(route);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!pendingRoute) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingRoute(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pendingRoute]);

  useEffect(() => {
    if (!showShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowShortcuts(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showShortcuts]);

  // Atajos globales (no interfieren con inputs)
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;

      // Atajos con modificador (Ctrl/Cmd)
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "n") {
          e.preventDefault();
          if (activeProjectName) {
            setPendingRoute("/designer");
          } else {
            reset();
            nav("/designer");
          }
          return;
        }
        if (k === "z" && pathname === "/nesting") {
          e.preventDefault();
          undoMove();
          return;
        }
        // Ctrl+S lo maneja Export.tsx (necesita acceso al modal)
        return;
      }
      if (e.altKey) return;

      // ? abre ayuda (Shift+/)
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      // g + letra → navegar
      if (e.key === "g") {
        gPending.current = true;
        if (gPrefixTimer.current) window.clearTimeout(gPrefixTimer.current);
        gPrefixTimer.current = window.setTimeout(() => {
          gPending.current = false;
        }, 800);
        return;
      }

      if (gPending.current) {
        gPending.current = false;
        if (gPrefixTimer.current) window.clearTimeout(gPrefixTimer.current);
        const route = ROUTE_BY_KEY[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          if (!onIntercept(route)) nav(route);
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (gPrefixTimer.current) window.clearTimeout(gPrefixTimer.current);
    };
  }, [nav, activeProjectName, pathname, reset, undoMove, result]);

  const handleSaveFirst = () => {
    setPendingRoute(null);
    nav("/export");
  };

  const handleDiscard = () => {
    const target = pendingRoute;
    setPendingRoute(null);
    reset();
    if (target) nav(target);
  };

  return (
    <div className="grid h-full grid-rows-[48px_1fr_28px] bg-bg text-text">
      <TopBar onShowShortcuts={() => setShowShortcuts(true)} />
      <div className="grid min-h-0 grid-cols-[56px_1fr] overflow-hidden">
        <RailNav onIntercept={onIntercept} />
        <main className="relative min-h-0 overflow-hidden bg-bg">
          {!serverOnline && (
            <div className="flex items-center justify-between gap-3 border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm">
              <span className="flex items-center gap-2 text-danger">
                <WifiOff size={15} />
                Sin conexión con el servidor. Verificá que esté corriendo en :8000.
              </span>
              <button
                onClick={() => void serverCheckNow()}
                disabled={serverChecking}
                className="inline-flex items-center gap-1 rounded border border-danger/40 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-60"
              >
                <RefreshCw size={12} className={serverChecking ? "animate-spin" : ""} />
                {serverChecking ? "Comprobando…" : "Reintentar ahora"}
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <StatusBar />

      {pendingRoute &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPendingRoute(null);
            }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-flow-title"
              className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="border-b border-border px-5 py-4">
                <h2 id="leave-flow-title" className="text-sm font-semibold">
                  ¿Abandonar proyecto en curso?
                </h2>
              </div>
              <div className="px-5 py-4 text-sm text-text">
                <p>
                  Tenés{" "}
                  <span className="font-medium">"{activeProjectName}"</span>{" "}
                  sin guardar. ¿Querés continuar?
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="ghost" onClick={() => setPendingRoute(null)}>
                  Cancelar
                </Button>
                <Button variant="secondary" onClick={handleDiscard}>
                  Descartar y continuar
                </Button>
                <Button variant="primary" onClick={handleSaveFirst}>
                  Guardar primero
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showShortcuts &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowShortcuts(false); }}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-title"
              className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 id="shortcuts-title" className="text-sm font-semibold">
                  Atajos de teclado
                </h2>
                <button
                  onClick={() => setShowShortcuts(false)}
                  aria-label="Cerrar"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
                {Array.from(new Set(SHORTCUTS.map((s) => s.group))).map((group) => (
                  <div key={group} className="mb-4 last:mb-0">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {group}
                    </p>
                    <ul className="grid grid-cols-1 gap-1 text-sm">
                      {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                        <li key={s.keys} className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-surface-2">
                          <span className="text-text">{s.label}</span>
                          <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">
                            {s.keys}
                          </kbd>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="border-t border-border px-5 py-3 text-[11px] text-muted">
                Tip: presioná <kbd className="rounded bg-surface-2 px-1 font-mono">g</kbd> y luego la letra del destino.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
