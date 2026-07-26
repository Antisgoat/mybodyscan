import { ReactNode } from "react";
import Footer from "./Footer";
import AppHeader from "./AppHeader";
import DemoBanner from "@/components/DemoBanner";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <DemoBanner />
        {children}
      </main>
      <Footer />
    </div>
  );
}
