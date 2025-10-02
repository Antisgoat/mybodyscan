import { useDemoMode } from "./DemoModeProvider";

export function DemoBadge() {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">Demo</span>
  );
}
