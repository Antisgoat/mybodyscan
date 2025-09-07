import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { startCheckout } from "@/lib/payments";

export default function Plans() {
  return (
    <div className="max-w-md mx-auto space-y-6">
      <Seo title="Plans" description="Choose a plan" />
      <h1 className="text-2xl font-semibold">Plans</h1>
      <div className="grid gap-4">
        <Button
          onClick={() =>
            startCheckout(
              "price_1RuOpKQQU5vuhlNjipfFBsR0",
              "payment"
            )
          }
        >
          Buy Starter Scan
        </Button>
        <Button
          onClick={() =>
            startCheckout(
              "price_1S4XsVQQU5vuhlNjzdQzeySA",
              "subscription"
            )
          }
        >
          Subscribe Pro
        </Button>
        <Button
          onClick={() =>
            startCheckout(
              "price_1S4Y6YQQU5vuhlNjeJFmshxX",
              "subscription"
            )
          }
        >
          Subscribe Elite
        </Button>
      </div>
    </div>
  );
}
