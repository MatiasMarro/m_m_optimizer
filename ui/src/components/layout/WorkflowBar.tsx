import { useLocation } from "react-router-dom";
import { useProject } from "@/store/projectStore";

const STEPS: { route: string; label: string }[] = [
  { route: "/designer", label: "Diseñar" },
  { route: "/nesting", label: "Nesting" },
  { route: "/costs", label: "Costos" },
  { route: "/export", label: "Exportar" },
];

export default function WorkflowBar() {
  const { activeProjectName } = useProject();
  const { pathname } = useLocation();

  if (!activeProjectName) return null;

  const activeIdx = STEPS.findIndex((s) => s.route === pathname);

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
          return (
            <li key={step.route} className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : isDone
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-2 text-muted"
                }`}
                aria-current={isActive ? "step" : undefined}
              >
                {i + 1}
              </span>
              <span
                className={
                  isActive ? "font-medium text-text" : "text-muted"
                }
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="px-0.5 text-muted" aria-hidden>
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
