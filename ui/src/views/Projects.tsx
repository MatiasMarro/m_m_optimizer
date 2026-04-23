import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";

export default function Projects() {
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proyectos</h1>
        <Button><Plus size={16} /> Nuevo proyecto</Button>
      </div>
      <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
        Aún no hay proyectos. Crea el primero.
      </div>
    </div>
  );
}
