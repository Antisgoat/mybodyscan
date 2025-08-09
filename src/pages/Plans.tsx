import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openStripeCheckout } from "@/services/placeholders";
import { Seo } from "@/components/Seo";

const plans = [
  { title: "$9.99 per scan", copy: "Pay-as-you-go", plan: "single" as const, note: "Effective price: $9.99/scan" },
  { title: "$14.99/mo", copy: "3 scans/month", plan: "monthly" as const, note: "~$4.99 per scan" },
  { title: "$69.99/year", copy: "Best value", plan: "annual" as const, note: "~$1.94 per scan (36 scans)" },
];

const Plans = () => {
  const checkout = async (p: "single" | "monthly" | "annual") => {
    const { url } = await openStripeCheckout(p);
    window.open(url, "_blank");
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Plans – MyBodyScan" description="Choose pay-as-you-go or subscription to get more scans for less." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Plans</h1>
      <p className="text-sm text-muted-foreground mb-6">No free trial. DEXA scans can cost $50–$150—MyBodyScan is a fraction of that.</p>
      <div className="grid gap-4">
        {plans.map((p) => (
          <Card key={p.title} className="shadow-md">
            <CardHeader>
              <CardTitle>{p.title}</CardTitle>
              <CardDescription>{p.copy}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <span className="text-sm text-muted-foreground">{p.note}</span>
              <Button onClick={() => checkout(p.plan)}>Checkout</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
};

export default Plans;
