import { useCredits } from "@/hooks/useCredits";

export function CreditsBadge() {
  const { credits, unlimited, loading, demo } = useCredits();

  return (
    <div className="flex items-center gap-2">
      {demo && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground uppercase tracking-wide">
          Demo
        </span>
      )}
      <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
        Credits: {loading ? "…" : unlimited ? "∞" : credits}
      </div>
    </div>
  );
}
