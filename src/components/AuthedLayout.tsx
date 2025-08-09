import { ReactNode } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOutToAuth } from "@/lib/auth";

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="mx-auto max-w-2xl px-4 h-12 flex items-center justify-between">
          <button className="font-semibold" onClick={() => navigate("/home")}>MyBodyScan</button>
          <nav className="flex items-center gap-2 text-sm">
            <NavLink to="/home" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Home</NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>History</NavLink>
            <NavLink to="/plans" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Plans</NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Settings</NavLink>
            <Button size="sm" variant="outline" onClick={signOutToAuth}>Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
    </div>
  );
}
