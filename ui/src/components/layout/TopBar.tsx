import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Keyboard, Monitor, ChevronDown, Check } from "lucide-react";
import { useTheme, type ThemeMode } from "@/store/themeStore";
import { useProject } from "@/store/projectStore";
import WorkflowBar from "./WorkflowBar";

interface Props {
  onShowShortcuts?: () => void;
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "auto", label: "Auto (sistema)", icon: Monitor },
];

export default function TopBar({ onShowShortcuts }: Props) {
  const { mode, resolved, setMode } = useTheme();
  const { result } = useProject();
  const hasUnsaved = result !== null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ActiveIcon = resolved === "light" ? Sun : Moon;

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
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded p-1.5 hover:bg-surface-2"
            aria-label="Tema"
            aria-haspopup="menu"
            aria-expanded={open}
            title={`Tema: ${mode}`}
          >
            <ActiveIcon size={16} />
            <ChevronDown size={11} className="text-muted" />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
            >
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setMode(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                      active ? "text-primary" : "text-text"
                    }`}
                  >
                    <Icon size={14} />
                    <span className="flex-1">{opt.label}</span>
                    {active && <Check size={13} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
