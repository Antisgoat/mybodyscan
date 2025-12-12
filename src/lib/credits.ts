import type { UserProfile } from "./useUserProfile";

export function isAdmin(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.unlimitedCredits === true) return true;
  return (profile.role || "").toLowerCase() === "admin";
}

export function formatCredits(
  profile: UserProfile | null | undefined
): string | null {
  if (!profile) return null;
  if (isAdmin(profile)) return "Unlimited";
  const n =
    typeof profile.credits === "number" && isFinite(profile.credits)
      ? profile.credits
      : 0;
  return `${n} ${n === 1 ? "credit" : "credits"}`;
}
