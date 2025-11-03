import { useDemoMode } from "@/components/DemoModeProvider";
import { useAuthUser } from "@/lib/auth";

export function DemoBanner() {
  const demoMode = useDemoMode();
  const { user } = useAuthUser();

  if (!demoMode || !!user) return null;
  return (
    <div className="w-full bg-amber-50 text-amber-800 text-sm px-3 py-2 rounded-md border border-amber-200 mb-3">
      Demo preview — browse the experience without saving data. <strong>Sign up to save your progress.</strong>
    </div>
  );
}
