import { useCredits } from "@/hooks/useCredits";

export function CreditsBadge() {
  const { credits, unlimited } = useCredits();

  const displayCredits = unlimited ? "∞" : credits.toString();

  return (
    <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
      Credits: {displayCredits}
    </div>
  );
}
