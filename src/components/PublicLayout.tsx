import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSequencedAuth } from "@/lib/firebase/init";
import Footer from "./Footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const handleLaunch = async () => {
    const auth = await getSequencedAuth();
    if (auth.currentUser) navigate("/home");
    else navigate("/auth", { state: { from: location.pathname } });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-12 flex items-center justify-between">
          <button className="flex items-center gap-2 font-semibold" onClick={() => navigate("/")}>
            <img src="/logo.svg" alt="MyBodyScan" className="w-6 h-6" />
            MyBodyScan
          </button>
          <nav className="flex items-center gap-2 text-sm">
            <Button size="sm" variant="default" onClick={handleLaunch}>
              Launch App
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-3xl px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}
