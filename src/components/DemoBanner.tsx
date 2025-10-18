import { DEMO_MODE } from "@/env";
import { useDemoMode } from "@/components/DemoModeProvider";

export function DemoBanner() {
  const demo = useDemoMode();
  if (!DEMO_MODE && !demo) return null;
  return (
    <div className="w-full bg-amber-50 text-amber-800 text-sm px-3 py-2 rounded-md border border-amber-200 mb-3">
      Demo lets you browse; sign up to save your progress. Writes are disabled.
    </div>
  );
}
