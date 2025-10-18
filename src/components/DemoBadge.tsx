import { useAuthUser } from "@app/lib/auth.ts";
import { useDemoMode } from "@app/components/DemoModeProvider.tsx";

export function DemoBadge() {
  const { user } = useAuthUser();
  const demo = useDemoMode();
  if (!demo || !user?.isAnonymous) return null;
  return (
    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">Demo</span>
  );
}
