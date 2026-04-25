import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useProject } from "@/store/projectStore";
import TopBar from "./TopBar";
import RailNav from "./RailNav";
import StatusBar from "./StatusBar";

const GUARDED_ROUTE = "/designer";

export default function AppShell() {
  const { activeProjectName, reset } = useProject();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

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
      <TopBar />
      <div className="grid min-h-0 grid-cols-[56px_1fr] overflow-hidden">
        <RailNav onIntercept={onIntercept} />
        <main className="min-h-0 overflow-hidden bg-bg">
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
    </div>
  );
}
