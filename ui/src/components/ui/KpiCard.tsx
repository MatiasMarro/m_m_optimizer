import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}

const tones = {
  default: "text-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export default function KpiCard({ label, value, hint, icon: Icon, tone = "default" }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        {Icon && <Icon size={16} className="text-muted" />}
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
