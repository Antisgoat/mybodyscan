import { isDemoActive } from "@/lib/demo";
import { useAuthUser } from "@/lib/useAuthUser";

export default function DemoBanner() {
  const { user, loading } = useAuthUser();
  if (loading) return null; // avoid flash during auth init
  if (!isDemoActive()) return null; // hide for authed users or when demo disabled

  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
    >
      Demo lets you browse; sign up to save your progress.
    </div>
  );
}

export { DemoBanner };
