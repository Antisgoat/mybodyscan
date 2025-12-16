import { useAuthUser } from "@/lib/useAuthUser"; // from Prompt #1
import { useUserProfile } from "@/lib/useUserProfile";
import { formatCredits } from "@/lib/credits";
import { useUserClaims } from "@/lib/useUserClaims";
import { hasUnlimitedEntitlement } from "@/lib/entitlements";

export default function CreditBadge() {
  const { user, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile();
  const claims = useUserClaims();

  // Do not render while loading or signed out (prevents flicker)
  if (authLoading || profileLoading || !user) return null;

  const hasUnlimitedClaim = hasUnlimitedEntitlement((claims ?? undefined) as any);

  const label = hasUnlimitedClaim ? "Unlimited" : formatCredits(profile);
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
