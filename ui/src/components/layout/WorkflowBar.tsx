import { useLocation, useNavigate } from "react-router-dom";
import { useProject } from "@/store/projectStore";

const STEPS: { route: string; label: string }[] = [
  { route: "/designer", label: "Diseñar" },
  { route: "/nesting", label: "Nesting" },
  { route: "/costs", label: "Costos" },
  { route: "/export", label: "Exportar" },
];

export default function WorkflowBar() {
  const { activeProjectName, result } = useProject();
  const { pathname } = useLocation();
  const nav = useNavigate();

  if (!activeProjectName) return null;

  const activeIdx = STEPS.findIndex((s) => s.route === pathname);
  // Pasos posteriores a Diseñar requieren resultado
  const hasResult = result !== null;

  return (
    <div className="flex min-w-0 items-center gap-3 text-xs">
      <span className="truncate font-medium text-text" title={activeProjectName}>
        {activeProjectName}
      </span>
      <span className="text-muted">·</span>
      <ol className="flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const isActive = i === activeIdx;
          const isDone = activeIdx > i;
          const requiresResult = i > 0;
          const enabled = !requiresResult || hasResult;
          const onClick = () => {
            if (!enabled || isActive) return;
            nav(step.route);
          };
          return (
            <li key={step.route} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClick}
                disabled={!enabled || isActive}
                aria-current={isActive ? "step" : undefined}
                title={
                  !enabled
                    ? "Optimizá primero para habilitar este paso"
                    : isActive
                    ? "Paso actual"
                    : `Ir a ${step.label}`
                }
                className={`group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${
                  enabled && !isActive ? "hover:bg-surface-2 cursor-pointer" : ""
                } ${!enabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : isDone
                      ? "bg-primary/15 text-primary"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={isActive ? "font-medium text-text" : "text-muted group-hover:text-text"}>
                  {step.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="px-0.5 text-muted" aria-hidden>→</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
