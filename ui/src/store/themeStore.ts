import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

const KEY = "mm:theme";
const initial: Theme =
  (typeof localStorage !== "undefined" && (localStorage.getItem(KEY) as Theme)) || "light";

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  localStorage.setItem(KEY, t);
}

if (typeof document !== "undefined") apply(initial);

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial,
  toggle: () => {
    const next = get().theme === "light" ? "dark" : "light";
    apply(next);
    set({ theme: next });
  },
  set: (t) => {
    apply(t);
    set({ theme: t });
  },
}));
