import { ReactNode } from "react";
import Footer from "./Footer";
import AppHeader from "./AppHeader";
import DemoBanner from "@/components/DemoBanner";
import { useDemoWireup } from "@/hooks/useDemo";

export default function PublicLayout({ children }: { children: ReactNode }) {
  useDemoWireup();
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
        <DemoBanner />
        {children}
      </main>
      <Footer />
    </div>
  );
}
