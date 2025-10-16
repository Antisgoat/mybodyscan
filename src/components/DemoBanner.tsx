import { DEMO_MODE } from "@/env";
import { useDemoMode, useOfflineDemo } from "@/components/DemoModeProvider";

export function DemoBanner() {
  const demo = useDemoMode();
  const offline = useOfflineDemo();
  if (!DEMO_MODE && !demo && !offline) return null;
  const message = offline
    ? "Offline demo: using local seed data until you're back online."
    : "Demo lets you browse; sign up to save your progress. Writes are disabled.";
  return (
    <div className="w-full bg-amber-50 text-amber-800 text-sm px-3 py-2 rounded-md border border-amber-200 mb-3">
      {message}
    </div>
  );
}
