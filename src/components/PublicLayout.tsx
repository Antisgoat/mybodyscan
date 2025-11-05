import { ReactNode } from "react";
import Footer from "./Footer";
import AppHeader from "./AppHeader";
import { useDemoWireup } from "@/hooks/useDemo";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useAuthUser } from "@/lib/auth";

export default function PublicLayout({ children }: { children: ReactNode }) {
  useDemoWireup();
  const demo = useDemoMode();
  const { user } = useAuthUser();
  const showDemoBanner = demo && !user;
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
        {showDemoBanner && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="status">
            Demo lets you browse; writes are disabled.
          </div>
        )}
        {children}
      </main>
      <Footer />
    </div>
  );
}
