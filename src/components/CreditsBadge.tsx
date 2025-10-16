import { useCredits } from "@/hooks/useCredits";

export function CreditsBadge() {
  const { credits, unlimited, loading, demo, tester } = useCredits();

  return (
    <div className="flex items-center gap-2">
      {demo && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground uppercase tracking-wide">
          Demo
        </span>
      )}
      <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
        Credits: {loading ? "…" : unlimited ? "∞" : credits}
        {unlimited && tester && (
          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
            ∞ (dev)
          </span>
        )}
      </div>
    </div>
  );
}
