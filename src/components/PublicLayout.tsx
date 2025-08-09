import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { auth } from "@/firebaseConfig";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const handleLaunch = () => {
    if (auth.currentUser) navigate("/home");
    else navigate("/auth");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-12 flex items-center justify-between">
          <button className="font-semibold" onClick={() => navigate("/")}>MyBodyScan</button>
          <nav className="flex items-center gap-2 text-sm">
            <Button size="sm" variant="default" onClick={handleLaunch}>
              Launch App
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
