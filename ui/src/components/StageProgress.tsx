import { useEffect, useRef, useState } from "react";

interface Props {
  active: boolean;
  stages: string[];
  intervalMs?: number;
  className?: string;
}

export default function StageProgress({
  active,
  stages,
  intervalMs = 1400,
  className,
}: Props) {
  const [idx, setIdx] = useState(0);
  const elapsedRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setIdx(0);
      elapsedRef.current = 0;
      return;
    }
    const start = Date.now();
    const tick = window.setInterval(() => {
      elapsedRef.current = Date.now() - start;
      setIdx((i) => Math.min(i + 1, stages.length - 1));
    }, intervalMs);
    return () => window.clearInterval(tick);
  }, [active, stages.length, intervalMs]);

  if (!active) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
      <span>{stages[idx]}</span>
    </span>
  );
}

export const OPTIMIZE_STAGES = [
  "Calculando piezas…",
  "Optimizando placas…",
  "Calculando costos…",
  "Generando DXF…",
];
