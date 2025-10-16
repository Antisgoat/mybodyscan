import { useCredits } from "@/hooks/useCredits";
import { useAuthUser } from "@/lib/auth";
import { isWhitelisted } from "@/lib/whitelist";

export function CreditsBadge() {
  const { credits, unlimited, loading, demo } = useCredits();
  const { user } = useAuthUser();
  const isDevUser = user?.email ? isWhitelisted(user.email) : false;

  return (
    <div className="flex items-center gap-2">
      {demo && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground uppercase tracking-wide">
          Demo
        </span>
      )}
      {isDevUser && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 uppercase tracking-wide">
          Dev
        </span>
      )}
      <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
        Credits: {loading ? "…" : unlimited ? "∞" : credits}
      </div>
    </div>
  );
}
