import { useState } from "react";
import { apiFetchJson } from "@/lib/apiFetch";
import { useClaims } from "@/lib/claims";

export default function AdminQuick() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { claims, loading: claimsLoading } = useClaims();

  if (claimsLoading) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">
        Checking admin permissions…
      </div>
    );
  }

  if (!claims?.admin) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  async function grant(amount: number) {
    setLoading(true);
    setMessage(null);
    try {
      await apiFetchJson("/system/admin/grant-credits", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setMessage(`Granted ${amount} credits.`);
    } catch (error: any) {
      setMessage(error?.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-lg font-semibold">Admin tools</h1>
      <p className="text-xs text-muted-foreground">
        Quick credit adjustments for support.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={loading}
          className="rounded border px-3 py-2 text-sm"
          onClick={() => grant(5)}
        >
          Grant +5
        </button>
        <button
          type="button"
          disabled={loading}
          className="rounded border px-3 py-2 text-sm"
          onClick={() => grant(10)}
        >
          Grant +10
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </div>
  );
}
