import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { getCachedUser } from "@/auth/client";
import silhouetteFront from "@/assets/silhouette-front.png";
import { HOW_IT_WORKS } from "@/content/howItWorks";
import { PRICING_CATALOG } from "@/content/pricing";
import { enableDemo } from "@/state/demo";

const PublicLanding = () => {
  const navigate = useNavigate();
  const demoLink = "/demo";
  const handleLaunch = () => {
    if (getCachedUser()) navigate("/home");
    else navigate("/auth");
  };

  return (
    <>
      <Seo
        title="Body scans from your phone – MyBodyScan"
        description="Estimate body fat %, weight, and BMI from either a 4-photo scan or quick 2-photo scan. Track progress over time."
        canonical="https://mybodyscanapp.com/"
      />
      <section className="py-8">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <article>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Body scans from your phone
            </h1>
            <p className="mt-3 text-muted-foreground">
              Estimate body fat %, weight, and BMI from 4 photos (front, left,
              right, back) or a quick 2-photo scan (front + side). Track
              progress over time.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={handleLaunch}>
                Launch Web App
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/plans")}
              >
                Pricing
              </Button>
              <Link
                to={demoLink}
                className="btn-secondary"
                onClick={() => enableDemo()}
              >
                Browse the demo
              </Link>
            </div>
          </article>
          <aside className="justify-self-center md:justify-self-end">
            <img
              src={silhouetteFront}
              alt="MyBodyScan app illustration showing body scan silhouette"
              className="w-64 h-auto rounded-lg border shadow-sm"
              loading="lazy"
            />
          </aside>
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">How it works</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <article key={item.step} className="rounded-lg border p-4">
              <h3 className="font-medium">{item.step}</h3>
              <p className="text-sm text-muted-foreground mt-1">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">Pricing snapshot</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            PRICING_CATALOG.oneScan,
            PRICING_CATALOG.monthly,
            PRICING_CATALOG.yearly,
          ].map((card) => (
            <article key={card.id} className="rounded-xl border bg-card p-4">
              <h3 className="font-medium">{card.label}</h3>
              <p className="text-sm text-foreground mt-1">{card.priceText}</p>
              {card.blurb ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {card.blurb}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">Privacy & Security</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We take privacy seriously. Your account email and uploaded media are
          used only to provide estimates and stored securely. Data is never
          sold, and you can request deletion at any time.
        </p>
      </section>

      <footer className="py-8 border-t mt-8">
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link to="/terms" className="underline-offset-4 hover:underline">
            Terms
          </Link>
          <Link to="/support" className="underline-offset-4 hover:underline">
            Support
          </Link>
        </nav>
      </footer>
    </>
  );
};

export default PublicLanding;
