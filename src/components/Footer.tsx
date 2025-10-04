import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface BuildMeta {
  sha: string;
  builtAtISO: string;
}

export default function Footer() {
  const [build, setBuild] = useState<BuildMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/build.txt", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BuildMeta | null) => {
        if (!cancelled && data?.sha && data?.builtAtISO) {
          setBuild(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const buildLabel = build
    ? `${build.sha} · ${new Date(build.builtAtISO).toLocaleDateString()} ${new Date(build.builtAtISO).toLocaleTimeString()}`
    : null;

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>© 2024 MyBodyScan</span>
            {buildLabel ? <span className="text-xs text-muted-foreground">• Build {buildLabel}</span> : null}
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/legal/disclaimer" className="hover:text-foreground transition-colors">
              Health & Safety
            </Link>
            <a href="mailto:support@mybodyscan.com" className="hover:text-foreground transition-colors">
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}