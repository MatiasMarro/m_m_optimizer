import { createBrowserRouter } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/views/Dashboard";
import Projects from "@/views/Projects";
import Designer from "@/views/Designer";
import Nesting from "@/views/Nesting";
import Inventory from "@/views/Inventory";
import Costs from "@/views/Costs";
import Export from "@/views/Export";
import Settings from "@/views/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "projects", element: <Projects /> },
      { path: "designer", element: <Designer /> },
      { path: "nesting", element: <Nesting /> },
      { path: "inventory", element: <Inventory /> },
      { path: "costs", element: <Costs /> },
      { path: "export", element: <Export /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);
