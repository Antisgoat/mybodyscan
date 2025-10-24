import { ReactNode } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOutToAuth } from "@/lib/auth";
import Footer from "./Footer";
import CreditsBadge from "./CreditsBadge";

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="mx-auto max-w-2xl px-4 h-12 flex items-center justify-between">
          <button className="flex items-center gap-2 font-semibold" onClick={() => navigate("/today")}> 
            <img src="/logo.svg" alt="MyBodyScan" className="w-6 h-6" />
            MyBodyScan
          </button>
          <nav className="flex items-center gap-2 text-sm">
            <NavLink to="/today" className={({ isActive }) => (isActive ? "underline" : "opacity-80 hover:opacity-100")}>Today</NavLink>
            <NavLink to="/plans" className={({ isActive }) => (isActive ? "underline" : "opacity-80 hover:opacity-100")}>Plans</NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "underline" : "opacity-80 hover:opacity-100")}>Settings</NavLink>
            <CreditsBadge />
            <Button size="sm" variant="outline" onClick={signOutToAuth}>Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-2xl px-4 py-4">{children}</main>
      <Footer />
    </div>
  );
}
