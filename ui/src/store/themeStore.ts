import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const KEY = "mm:theme";

function readMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "light";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

function resolve(m: ThemeMode): ResolvedTheme {
  if (m === "auto") return systemPrefersDark() ? "dark" : "light";
  return m;
}

function apply(mode: ThemeMode): ResolvedTheme {
  const r = resolve(mode);
  document.documentElement.classList.toggle("dark", r === "dark");
  localStorage.setItem(KEY, mode);
  return r;
}

const initialMode: ThemeMode = readMode();
if (typeof document !== "undefined") apply(initialMode);

export const useTheme = create<ThemeState>((set, get) => ({
  mode: initialMode,
  resolved: resolve(initialMode),
  toggle: () => {
    const next: ThemeMode = get().resolved === "light" ? "dark" : "light";
    const r = apply(next);
    set({ mode: next, resolved: r });
  },
  setMode: (m) => {
    const r = apply(m);
    set({ mode: m, resolved: r });
  },
}));

if (typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    const s = useTheme.getState();
    if (s.mode !== "auto") return;
    const r: ResolvedTheme = mql.matches ? "dark" : "light";
    document.documentElement.classList.toggle("dark", r === "dark");
    useTheme.setState({ resolved: r });
  };
  if (mql.addEventListener) mql.addEventListener("change", onChange);
  else mql.addListener(onChange);
}
