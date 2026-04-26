import { Moon, Sun, Keyboard } from "lucide-react";
import { useTheme } from "@/store/themeStore";
import { useProject } from "@/store/projectStore";
import WorkflowBar from "./WorkflowBar";

interface Props {
  onShowShortcuts?: () => void;
}

export default function TopBar({ onShowShortcuts }: Props) {
  const { theme, toggle } = useTheme();
  const { result } = useProject();
  const hasUnsaved = result !== null;

  return (
    <header className="flex items-center justify-between gap-6 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-3">
          <div className="relative h-6 w-6 rounded bg-primary" aria-hidden>
            {hasUnsaved && (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-surface"
                title="Hay un proyecto activo sin guardar"
              />
            )}
          </div>
          <span className="font-semibold tracking-tight">m_m optimizer</span>
          <span className="text-xs text-muted">· Nesting CNC</span>
        </div>
        <div className="ml-2 hidden min-w-0 md:flex">
          <WorkflowBar />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onShowShortcuts && (
          <button
            onClick={onShowShortcuts}
            className="rounded p-1.5 hover:bg-surface-2"
            aria-label="Atajos de teclado"
            title="Atajos de teclado (?)"
          >
            <Keyboard size={16} />
          </button>
        )}
        <button
          onClick={toggle}
          className="rounded p-1.5 hover:bg-surface-2"
          aria-label={`Cambiar a tema ${theme === "light" ? "oscuro" : "claro"}`}
          title={`Cambiar a tema ${theme === "light" ? "oscuro" : "claro"}`}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
}
