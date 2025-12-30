import { useAuthUser } from "@/lib/useAuthUser";
import { useCredits } from "@/hooks/useCredits";

export default function CreditBadge() {
  const { user, loading: authLoading } = useAuthUser();
  const { credits, loading: creditsLoading, unlimited } = useCredits();

  // Do not render while loading or signed out (prevents flicker)
  if (authLoading || creditsLoading || !user) return null;

  const label = (() => {
    if (unlimited || credits === Infinity) return "Unlimited";
    const n = Number.isFinite(credits) ? Math.max(0, Math.floor(Number(credits))) : 0;
    return `${n} ${n === 1 ? "credit" : "credits"}`;
  })();
  if (!label) return null;

  return (
    <span
      data-testid="credit-badge"
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
      title="Your available scan credits"
    >
      {label}
    </span>
  );
}
