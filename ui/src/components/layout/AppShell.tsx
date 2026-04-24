import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import RailNav from "./RailNav";
import StatusBar from "./StatusBar";

export default function AppShell() {
  return (
    <div className="grid h-full grid-rows-[48px_1fr_28px] bg-bg text-text">
      <TopBar />
      <div className="grid min-h-0 grid-cols-[56px_1fr] overflow-hidden">
        <RailNav />
        <main className="min-h-0 overflow-hidden bg-bg">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
