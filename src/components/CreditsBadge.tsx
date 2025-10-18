import { useCredits } from "@/hooks/useCredits";

export function CreditsBadge() {
  const { credits, unlimited, loading } = useCredits();

  if (loading) {
    return (
      <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
        Credits: ...
      </div>
    );
  }

  return (
    <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
      Credits: {unlimited ? "∞" : credits}
    </div>
  );
}
