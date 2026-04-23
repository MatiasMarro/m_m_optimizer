import type { ReactNode } from "react";

export default function InspectorPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="space-y-4 p-4">{children}</div>
    </aside>
  );
}
