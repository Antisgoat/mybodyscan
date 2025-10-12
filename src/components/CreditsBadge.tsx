import { useCredits } from "@/hooks/useCredits";

export function CreditsBadge() {
  const { credits, unlimited } = useCredits();

  // Display infinity symbol for unlimited credits
  const displayValue = unlimited ? "∞" : credits;

  return (
    <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
      Credits: {displayValue}
    </div>
  );
}
