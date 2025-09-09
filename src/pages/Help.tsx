import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { supportMailto } from "@/lib/support";

const Help = () => {
  return (
    <>
      <Seo
        title="Help Center – MyBodyScan"
        description="Answers to common questions and support." 
        canonical="https://mybodyscanapp.com/help"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none p-6">
        <h1>Help Center</h1>
        <h2>Why can’t I scan?</h2>
        <p>You need an available credit; buy one on the Plans page.</p>
        <h2>How many scans per plan?</h2>
        <p>Starter includes 1, Pro 3 per month, and Elite 36 per year. Credits roll over for 12 months.</p>
        <h2>What photos do I need?</h2>
        <p>Use good lighting, a plain background, and capture your full body.</p>
        <h2>Calories look different than I entered</h2>
        <p>Entries are reconciled to your macro targets so totals may shift slightly.</p>
        <h2>Delete my data</h2>
        <p>Use Settings → Delete or email <a href="mailto:support@mybodyscanapp.com">support@mybodyscanapp.com</a>.</p>
        <Button className="mt-4" onClick={() => { window.location.href = supportMailto(); }}>
          Report a problem
        </Button>
      </article>
    </>
  );
};

export default Help;
