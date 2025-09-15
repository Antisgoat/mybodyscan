import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { copyDiagnostics } from "@/lib/diagnostics";

const Support = () => {
  return (
    <>
      <Seo
        title="Support – MyBodyScan"
        description="Get help with MyBodyScan. Contact support@mybodyscanapp.com or call our support line."
        canonical="https://mybodyscanapp.com/support"
      />
      <section className="space-y-6">
        <article className="rounded-lg border p-4">
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Email: <a className="underline" href="mailto:support@mybodyscanapp.com">support@mybodyscanapp.com</a>
          </p>
          <p className="text-sm text-muted-foreground">Phone: (555) 555-1234</p>
          <Button
            className="mt-4"
            onClick={async () => { await copyDiagnostics(); toast({ title: "Copied diagnostics" }); }}
          >
            Copy diagnostics
          </Button>
        </article>

        <article className="rounded-lg border p-4">
          <h2 className="font-medium">FAQ</h2>
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="font-medium">How long does a scan take?</h3>
              <p className="text-sm text-muted-foreground">Most scans complete within a minute after upload.</p>
            </div>
            <div>
              <h3 className="font-medium">How do I delete my account?</h3>
              <p className="text-sm text-muted-foreground">
                Email <a className="underline" href="mailto:support@mybodyscanapp.com">support@mybodyscanapp.com</a> from your account email and we’ll process the deletion.
              </p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
};

export default Support;
