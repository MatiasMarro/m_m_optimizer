import { create } from "zustand";

interface ServerState {
  online: boolean;
  checking: boolean;
  lastCheckAt: number | null;
  retryInMs: number;
  checkNow: () => Promise<void>;
}

const HEALTH_URL = "/api/health";
const TIMEOUT_MS = 4000;
const OK_INTERVAL_MS = 30_000;

async function pingHealth(): Promise<boolean> {
  if (typeof fetch === "undefined") return true;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

export const useServer = create<ServerState>((set, get) => ({
  online: true,
  checking: false,
  lastCheckAt: null,
  retryInMs: OK_INTERVAL_MS,
  checkNow: async () => {
    if (get().checking) return;
    set({ checking: true });
    const ok = await pingHealth();
    const prevDown = !get().online;
    const next: Partial<ServerState> = {
      online: ok,
      checking: false,
      lastCheckAt: Date.now(),
    };
    if (ok) {
      next.retryInMs = OK_INTERVAL_MS;
    } else {
      // Backoff suave: 3 → 5 → 8 → 15s
      const cur = get().retryInMs;
      const seq = [3000, 5000, 8000, 15_000];
      const idx = Math.min(seq.indexOf(cur) + 1, seq.length - 1);
      next.retryInMs = prevDown && idx >= 0 ? seq[idx] : seq[0];
    }
    set(next);
  },
}));

// Polling automático en navegadores
if (typeof window !== "undefined") {
  let timer: number | null = null;

  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    const delay = useServer.getState().retryInMs;
    timer = window.setTimeout(async () => {
      await useServer.getState().checkNow();
      schedule();
    }, delay);
  };

  void useServer.getState().checkNow().then(schedule);

  // Re-check al volver de background o reconectar la red
  window.addEventListener("online", () => void useServer.getState().checkNow());
  window.addEventListener("focus", () => {
    const last = useServer.getState().lastCheckAt;
    if (!last || Date.now() - last > 5000) void useServer.getState().checkNow();
  });
}
