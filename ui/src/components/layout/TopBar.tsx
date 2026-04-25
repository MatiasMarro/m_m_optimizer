import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/store/themeStore";
import WorkflowBar from "./WorkflowBar";

export default function TopBar() {
  const { theme, toggle } = useTheme();
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-3">
          <div className="h-6 w-6 rounded bg-primary" aria-hidden />
          <span className="font-semibold tracking-tight">m_m optimizer</span>
          <span className="text-xs text-muted">· Nesting CNC</span>
        </div>
        <div className="ml-2 hidden min-w-0 md:flex">
          <WorkflowBar />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={toggle}
          className="rounded p-1.5 hover:bg-surface-2"
          aria-label="Alternar tema"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
}
