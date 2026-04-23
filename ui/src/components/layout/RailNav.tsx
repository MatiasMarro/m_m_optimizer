import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Ruler,
  LayoutGrid,
  Package,
  DollarSign,
  Download,
  Settings,
} from "lucide-react";

const items = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/projects", icon: FolderKanban, label: "Proyectos" },
  { to: "/designer", icon: Ruler, label: "Diseñador" },
  { to: "/nesting", icon: LayoutGrid, label: "Nesting" },
  { to: "/inventory", icon: Package, label: "Retazos" },
  { to: "/costs", icon: DollarSign, label: "Costos" },
  { to: "/export", icon: Download, label: "Exportar" },
  { to: "/settings", icon: Settings, label: "Ajustes" },
];

export default function RailNav() {
  return (
    <nav className="flex flex-col items-center gap-1 border-r border-border bg-surface py-2">
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          title={label}
          className={({ isActive }) =>
            `flex h-10 w-10 items-center justify-center rounded transition-colors ${
              isActive
                ? "bg-primary text-white"
                : "text-muted hover:bg-surface-2 hover:text-text"
            }`
          }
        >
          <Icon size={20} />
        </NavLink>
      ))}
    </nav>
  );
}
