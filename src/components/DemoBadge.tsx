import { isDemoGuest } from "@/lib/demoFlag";

export function DemoBadge() {
  if (!isDemoGuest()) return null;
  return (
    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">Demo</span>
  );
}
