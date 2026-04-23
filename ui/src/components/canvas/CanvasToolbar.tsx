import { Grid3x3, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
  onToggleGrid?: () => void;
}

export default function CanvasToolbar({ onZoomIn, onZoomOut, onFit, onToggleGrid }: Props) {
  const btn = "rounded p-1.5 hover:bg-surface-2 text-muted hover:text-text";
  return (
    <div className="flex items-center gap-1 border-b border-border bg-surface px-2 py-1">
      <button className={btn} onClick={onZoomIn} title="Acercar"><ZoomIn size={16} /></button>
      <button className={btn} onClick={onZoomOut} title="Alejar"><ZoomOut size={16} /></button>
      <button className={btn} onClick={onFit} title="Ajustar"><Maximize2 size={16} /></button>
      <span className="mx-1 h-5 w-px bg-border" />
      <button className={btn} onClick={onToggleGrid} title="Grilla"><Grid3x3 size={16} /></button>
    </div>
  );
}
