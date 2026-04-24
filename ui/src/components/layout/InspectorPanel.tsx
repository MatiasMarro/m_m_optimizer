import type { ReactNode } from "react";

export default function InspectorPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface">
      <div className="shrink-0 border-b border-border px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">{children}</div>
    </aside>
  );
}
