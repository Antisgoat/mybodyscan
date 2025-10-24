import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isStripeEnabled, openBillingPortal, startCheckout } from "@/lib/stripeClient";

type Props = {
  className?: string;
};

export default function BillingButtons({ className }: Props) {
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const enabled = isStripeEnabled();
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
      await openBillingPortal();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBuy} disabled={!enabled || busy}>
          {pending === "checkout" ? "Loading…" : "Buy Credits"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onManage} disabled={!enabled || busy}>
          {pending === "portal" ? "Loading…" : "Manage Billing"}
        </Button>
      </div>
      {!enabled && <div className="mt-1 text-xs text-muted-foreground">Billing disabled (no Stripe key).</div>}
    </div>
  );
}
