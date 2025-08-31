import { ReactNode } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOutToAuth } from "@/lib/auth";
import Footer from "./Footer";
import { useCredits } from "@/hooks/useCredits";

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { credits } = useCredits();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="mx-auto max-w-2xl px-4 h-12 flex items-center justify-between">
          <button className="flex items-center gap-2 font-semibold" onClick={() => navigate("/home")}>
            <img src="/logo.svg" alt="MyBodyScan" className="w-6 h-6" />
            MyBodyScan
          </button>
          <nav className="flex items-center gap-2 text-sm">
            <NavLink to="/home" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Home</NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>History</NavLink>
            <NavLink to="/report" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Report</NavLink>
            <NavLink to="/plans" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Plans</NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? "underline" : "opacity-80 hover:opacity-100"}>Settings</NavLink>
            <span className="opacity-80">Credits: {credits}</span>
            <Button size="sm" variant="outline" onClick={signOutToAuth}>Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-2xl px-4 py-4">{children}</main>
      <Footer />
    </div>
  );
}
