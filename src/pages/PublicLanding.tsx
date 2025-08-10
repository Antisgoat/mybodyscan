import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { auth } from "@/firebaseConfig";
import silhouetteFront from "@/assets/silhouette-front.png";

const PublicLanding = () => {
  const navigate = useNavigate();
  const handleLaunch = () => {
    if (auth.currentUser) navigate("/home");
    else navigate("/auth");
  };

  return (
    <>
      <Seo
        title="Body scans from your phone – MyBodyScan"
        description="Estimate body fat %, weight, and BMI from photos or a 10s video. Track progress over time."
        canonical="https://mybodyscanapp.com/"
      />
      <section className="py-8">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <article>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Body scans from your phone
            </h1>
            <p className="mt-3 text-muted-foreground">
              Estimate body fat %, weight, and BMI from 4 photos or a 10s video. Track progress over time.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={handleLaunch}>Launch Web App</Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/plans")}>Pricing</Button>
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
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">1) Capture</h3>
            <p className="text-sm text-muted-foreground mt-1">Take 4 photos or a quick 10-second video.</p>
          </article>
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">2) Process</h3>
            <p className="text-sm text-muted-foreground mt-1">Our smart system estimates body fat %, weight, and BMI.</p>
          </article>
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">3) Track</h3>
            <p className="text-sm text-muted-foreground mt-1">Build history and visualize progress over time.</p>
          </article>
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">Pricing snapshot</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">1 Scan</h3>
            <p className="text-sm text-muted-foreground">$9.99</p>
          </article>
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">3 Scans</h3>
            <p className="text-sm text-muted-foreground">$19.99</p>
          </article>
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">5 Scans</h3>
            <p className="text-sm text-muted-foreground">$29.99</p>
          </article>
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">Monthly</h3>
            <p className="text-sm text-muted-foreground">$14.99</p>
          </article>
          <article className="rounded-lg border p-4">
            <h3 className="font-medium">Yearly</h3>
            <p className="text-sm text-muted-foreground">$99.99</p>
          </article>
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">Privacy & Security</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We take privacy seriously. Your account email and uploaded media are used only to provide estimates and stored securely. Data is never sold, and you can request deletion at any time.
        </p>
      </section>

      <footer className="py-8 border-t mt-8">
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link to="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
          <Link to="/terms" className="underline-offset-4 hover:underline">Terms</Link>
          <Link to="/support" className="underline-offset-4 hover:underline">Support</Link>
        </nav>
      </footer>
    </>
  );
};

export default PublicLanding;
