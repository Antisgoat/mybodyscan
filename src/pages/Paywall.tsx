import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/auth/mbs-auth";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { isNative } from "@/lib/platform";
import {
  getOfferings,
  initPurchases,
  purchasePackage,
  restorePurchases,
  type IapPackage,
} from "@/lib/billing/iapProvider";
import {
  getIapProductKind,
  isIapSubscription,
} from "@/lib/billing/iapProducts";

export default function PaywallPage() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthUser();
  const { entitlements, loading: entitlementsLoading } = useEntitlements();

  const [loading, setLoading] = useState(true);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [packages, setPackages] = useState<IapPackage[]>([]);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);

  const entitled = hasPro(entitlements);

  const native = isNative();
  useEffect(() => {
    if (!native) {
      setOfferingsError("In-app purchases are only available on mobile.");
      setPackages([]);
      setLoading(false);
      return;
    }
    if (!user?.uid) {
      setOfferingsError("Sign in required to purchase.");
      setPackages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setOfferingsError(null);
      const init = await initPurchases({ uid: user.uid });
      if (!init.ok) {
        if (!cancelled) {
          setOfferingsError(init.message);
          setPackages([]);
          setLoading(false);
        }
        return;
      }
      const res = await getOfferings();
      if (!res.ok) {
        if (!cancelled) {
          setOfferingsError(res.message);
          setPackages([]);
          setLoading(false);
        }
        return;
      }
      const current = res.value?.current;
      const offeredPackages = Array.isArray(current?.availablePackages)
        ? current.availablePackages
        : [];
      // Only display products the webhook can safely fulfill. A dashboard
      // typo must never sell an item that grants neither access nor credits.
      const nextPackages = offeredPackages.filter((pkg) =>
        Boolean(getIapProductKind(String(pkg.product?.identifier || "")))
      );
      if (!cancelled) {
        setPackages(nextPackages);
        if (nextPackages.length === 0) {
          setOfferingsError(
            "Purchases are temporarily unavailable. Please try again later."
          );
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [native, user?.uid]);

  const sortedPackages = useMemo(() => {
    const copy = [...packages];
    copy.sort((a, b) => {
      const ap = Number(a?.product?.price ?? 0);
      const bp = Number(b?.product?.price ?? 0);
      if (ap !== bp) return ap - bp;
      return String(a?.identifier || "").localeCompare(String(b?.identifier || ""));
    });
    return copy;
  }, [packages]);

  const onBuy = useCallback(
    async (pkg: IapPackage) => {
      if (busy) return;
      if (!user?.uid) {
        toast({ title: "Sign in required", description: "Please sign in to continue." });
        nav("/auth?next=/paywall");
        return;
      }
      setBusy("buy");
      try {
        const result = await purchasePackage(pkg);
        if (!result.ok) {
          if (result.code !== "cancelled") {
            toast({
              title: "Purchase failed",
              description: result.message,
              variant: "destructive",
            });
          }
          return;
        }
        toast({
          title: "Purchase submitted",
          description: "Verifying your purchase… this may take a few seconds.",
        });
        // NOTE: No client-side unlock here. The app will update once the server grants entitlements.
      } finally {
        setBusy(null);
      }
    },
    [busy, nav, toast, user?.uid]
  );

  const onRestore = useCallback(async () => {
    if (busy) return;
    if (!user?.uid) {
      toast({ title: "Sign in required", description: "Please sign in to continue." });
      nav("/auth?next=/paywall");
      return;
    }
    setBusy("restore");
    try {
      const result = await restorePurchases();
      if (!result.ok) {
        toast({ title: "Restore failed", description: result.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Restore complete",
        description: "Verifying… if you’re entitled, Pro will unlock shortly.",
      });
    } finally {
      setBusy(null);
    }
  }, [busy, nav, toast, user?.uid]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Go Pro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect every scan to the actions that move your progress forward.
          </p>
          <ul className="space-y-2 text-sm">
            {[
              "Source-labeled four-photo body reports",
              "Personalized workout plans and progression",
              "Personalized 7-day meal plans, targets, and meal logging",
              "MBS Product Insight and same-category alternatives",
              "Scan comparisons, AI Coach, and opt-in plateau check-ins",
              "Process-based daily Momentum without appearance rankings",
              "Optional adult Transformation Previews",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          {entitlementsLoading ? (
            <div className="text-sm text-muted-foreground">Checking your access…</div>
          ) : entitled ? (
            <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900">
              <AlertTitle>Pro active</AlertTitle>
              <AlertDescription>
                You’re all set. Your account has Pro access on this device.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {offeringsError && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertTitle>Purchases unavailable</AlertTitle>
          <AlertDescription>{offeringsError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading offers…
              </span>
            </CardContent>
          </Card>
        ) : (
          sortedPackages.map((pkg) => {
            const product = pkg.product as any;
            const productKind = getIapProductKind(
              String(product?.identifier || "")
            );
            if (!productKind) return null;
            const subscription = isIapSubscription(productKind);
            const title =
              (typeof product?.title === "string" && product.title.trim()) ||
              (typeof product?.identifier === "string" && product.identifier) ||
              "Pro";
            const price =
              (typeof product?.priceString === "string" && product.priceString) ||
              (typeof product?.formattedPrice === "string" && product.formattedPrice) ||
              "";
            const description =
              (typeof product?.description === "string" && product.description.trim()) || "";
            return (
              <Card key={pkg.identifier}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{title}</span>
                    <span className="text-sm font-semibold">{price}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {description ? (
                    <p className="text-sm text-muted-foreground">{description}</p>
                  ) : null}
                  <Button
                    className="w-full"
                    disabled={busy !== null || (entitled && subscription)}
                    onClick={() => void onBuy(pkg)}
                  >
                    {entitled && subscription
                      ? "Already Pro"
                      : busy === "buy"
                        ? "Processing…"
                        : productKind === "one"
                          ? "Buy scan credit"
                          : "Continue"}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy !== null || !native || !user?.uid}
          onClick={() => void onRestore()}
        >
          {busy === "restore" ? "Restoring…" : "Restore Purchases"}
        </Button>

        <Button type="button" variant="ghost" className="w-full" onClick={() => nav(-1)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
