import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isStripeEnabled } from "@/lib/stripeClient";
import { toast } from "@/hooks/use-toast";
import { isNative } from "@/lib/platform";
import {
  openCustomerPortal,
  startCheckout,
  PRICE_IDS,
  describeCheckoutError,
  describePortalError,
  getPaymentFunctionUrl,
  getPaymentHostingPath,
  isHostingShimEnabled,
} from "@/lib/payments";

type Props = {
  className?: string;
};

export default function BillingButtons({ className }: Props) {
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const enabled = isStripeEnabled();
  const native = isNative();
  const [portalAvailable, setPortalAvailable] = useState<boolean>(false);
  useEffect(() => {
    if (native) {
      setPortalAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const shimEnabled = isHostingShimEnabled();
      const endpoints: Array<{ url: string; kind: "function" | "hosting" }> = [
        {
          url: getPaymentFunctionUrl("createCustomerPortal"),
          kind: "function",
        },
      ];
      if (shimEnabled) {
        endpoints.push({
          url: getPaymentHostingPath("createCustomerPortal"),
          kind: "hosting",
        });
      }

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint.url, { method: "OPTIONS" });
          if (!cancelled) {
            setPortalAvailable(res.ok);
          }
          return;
        } catch (error) {
          if (endpoint.kind === "function" && shimEnabled) {
            continue;
          }
          if (!cancelled) {
            setPortalAvailable(false);
          }
          return;
        }
      }

      if (!cancelled) {
        setPortalAvailable(false);
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
      await startCheckout({ plan: "one", priceId: PRICE_IDS.ONE_TIME_STARTER });
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : undefined;
      const message = describeCheckoutError(code);
      const description =
        import.meta.env.DEV && code ? `${message} (${code})` : message;
      toast({
        title: "Unable to start checkout",
        description,
        variant: "destructive",
      });
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
      await openCustomerPortal();
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : undefined;
      const message = describePortalError(code);
      const description =
        import.meta.env.DEV && code ? `${message} (${code})` : message;
      toast({
        title: "Unable to open billing portal",
        description,
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {native ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.location.assign("/paywall")}
            aria-label="Upgrade"
          >
            Upgrade
          </Button>
        ) : (
          <>
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
              {pending === "portal"
                ? "Loading…"
                : portalAvailable
                  ? "Manage Billing"
                  : "Portal unavailable"}
            </Button>
          </>
        )}
      </div>
      {!enabled && !native && (
        <div className="mt-1 text-xs text-muted-foreground">
          Billing disabled (no Stripe key).
        </div>
      )}
    </div>
  );
}
