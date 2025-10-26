import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isStripeEnabled, openBillingPortal, startCheckout } from "@/lib/stripeClient";
import { toast } from "@/hooks/use-toast";

type Props = {
  className?: string;
};

export default function BillingButtons({ className }: Props) {
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const enabled = isStripeEnabled();
  const [portalAvailable, setPortalAvailable] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/createCustomerPortal", { method: "HEAD" });
        if (!cancelled) setPortalAvailable(res.ok);
      } catch {
        if (!cancelled) setPortalAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const busy = Boolean(pending);

  async function onBuy() {
    if (!enabled) return;
    setPending("checkout");
    try {
      await startCheckout();
    } finally {
      setPending(null);
    }
  }

  async function onManage() {
    if (!enabled) return;
    setPending("portal");
    try {
      if (!portalAvailable) {
        toast({ title: "Portal not available yet." });
        return;
      }
      await openBillingPortal();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBuy}
          disabled={!enabled || busy}
          aria-label="Buy credits"
        >
          {pending === "checkout" ? "Loading…" : "Buy Credits"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onManage}
          disabled={!enabled || busy || !portalAvailable}
          aria-label="Manage billing"
        >
          {pending === "portal" ? "Loading…" : portalAvailable ? "Manage Billing" : "Portal unavailable"}
        </Button>
      </div>
      {!enabled && <div className="mt-1 text-xs text-muted-foreground">Billing disabled (no Stripe key).</div>}
    </div>
  );
}
