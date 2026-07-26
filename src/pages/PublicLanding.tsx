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
      <section className="py-10 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:items-center">
          <article>
            <p className="mb-3 text-sm font-semibold text-primary">
              Your progress, clearly explained
            </p>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              See your progress. Know what to do next.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Four guided photos create a transparent body-composition wellness
              estimate. MyBodyScan then connects that report to personalized
              training, nutrition, food insights, and progress coaching.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Photo-based results are estimates, not medical measurements or
              diagnoses.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
              <Button asChild size="lg" variant="secondary">
                <Link to={demoLink} onClick={() => enableDemo()}>
                  Browse the demo
                </Link>
              </Button>
            </div>
          </article>
          <aside className="w-full justify-self-center md:justify-self-end">
            <div className="mx-auto max-w-sm rounded-[2rem] border border-primary/15 bg-gradient-to-br from-white via-blue-50 to-cyan-50 p-6 shadow-[0_24px_60px_rgba(37,99,235,0.12)]">
              <div className="mb-4 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Four-photo scan</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  Private
                </span>
              </div>
              <img
                src={silhouetteFront}
                alt="MyBodyScan app illustration showing body scan silhouette"
                className="mx-auto h-auto w-56 rounded-2xl border border-white/80 bg-white/80"
                loading="lazy"
              />
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Estimates, calculations, and observations stay clearly labeled.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="py-10 sm:py-14">
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
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_HIGHLIGHTS.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)]"
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

      <section className="py-10 sm:py-14">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <article
              key={item.step}
              className="rounded-2xl border border-border/80 bg-card p-5"
            >
              <h3 className="font-medium">{item.step}</h3>
              <p className="text-sm text-muted-foreground mt-1">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <h2 className="text-2xl font-semibold">Simple pricing</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            PRICING_CATALOG.oneScan,
            PRICING_CATALOG.monthly,
            PRICING_CATALOG.yearly,
          ].map((card) => (
            <article
              key={card.id}
              className={`rounded-2xl border bg-card p-5 ${
                card.id === "monthly"
                  ? "border-primary/40 shadow-[0_12px_36px_rgba(37,99,235,0.10)]"
                  : "border-border/80"
              }`}
            >
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

      <section className="my-10 rounded-2xl border border-border/80 bg-card p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Privacy & Security</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your uploaded media stays private to your account and is used to
          provide the scan and optional features you request. We do not sell
          your data. You can delete your account and associated scan data from
          Settings.
        </p>
      </section>
    </>
  );
};

export default PublicLanding;
