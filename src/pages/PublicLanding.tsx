import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { getCachedUser } from "@/auth/mbs-auth";
import silhouetteFront from "@/assets/silhouette-front.png";
import { HOW_IT_WORKS } from "@/content/howItWorks";
import { PRICING_CATALOG } from "@/content/pricing";
import { enableDemo } from "@/state/demo";
import {
  BellRing,
  Dumbbell,
  ScanLine,
  SearchCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const PRODUCT_HIGHLIGHTS = [
  {
    title: "Transparent four-photo report",
    description:
      "Understand what you entered, what was estimated from photos, what was visually observed, and what was calculated.",
    icon: ScanLine,
  },
  {
    title: "Training built around your life",
    description:
      "Get a workout plan shaped by your goal, experience, schedule, equipment, and stated limitations.",
    icon: Dumbbell,
  },
  {
    title: "A practical seven-day meal plan",
    description:
      "Turn your calculated calorie and macro targets into daily meal ideas matched to your saved diet preference, then log what you actually eat.",
    icon: Sparkles,
  },
  {
    title: "Original food insights",
    description:
      "Search or scan a barcode to see a transparent MBS Product Insight and higher-scoring same-category alternatives when the data supports them.",
    icon: SearchCheck,
  },
  {
    title: "A progress loop—not a one-off number",
    description:
      "Compare valid scans, follow workout progression, and see trends without treating a photo estimate like a medical test.",
    icon: TrendingUp,
  },
  {
    title: "Optional accountability",
    description:
      "Build momentum with process-based milestones and opt into conservative plateau check-ins. Notifications stay off until you enable them.",
    icon: BellRing,
  },
] as const;

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
        title="Body progress, training, and nutrition in one place – MyBodyScan"
        description="Turn four guided photos into a transparent wellness estimate, then follow connected workout, nutrition, food, and progress tools."
        canonical="https://mybodyscanapp.com/"
      />
      <section className="py-8">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <article>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              See your progress. Know what to do next.
            </h1>
            <p className="mt-3 text-muted-foreground">
              Four guided photos create a transparent body-composition wellness
              estimate. MyBodyScan then connects that report to personalized
              training, nutrition, food insights, and progress coaching.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Photo-based results are estimates, not medical measurements or
              diagnoses.
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
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">
            More than a scan result
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            One connected body-progress system
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your scan, plan, daily actions, and future check-ins work together
            so you can focus on the next useful step.
          </p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_HIGHLIGHTS.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-xl border bg-card p-5 shadow-sm"
            >
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
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
          Your uploaded media stays private to your account and is used to
          provide the scan and optional features you request. We do not sell
          your data. You can delete your account and associated scan data from
          Settings.
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
