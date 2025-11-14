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
      className="bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2 text-sm"
    >
      Demo lets you browse; sign up to save your progress.
    </div>
  );
}

export { DemoBanner };
