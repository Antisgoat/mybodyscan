import { Link } from "react-router-dom";

export function AppFooter() {
  return (
    <footer className="w-full border-t mt-10 py-6 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4">
        <span>© {new Date().getFullYear()} MyBodyScan</span>
        <span>•</span>
        <Link to="/system/check" className="underline">
          System check
        </Link>
        <span>•</span>
        <a href="/legal/terms.html" className="underline">
          Terms
        </a>
        <span>•</span>
        <a href="/legal/privacy.html" className="underline">
          Privacy
        </a>
      </div>
    </footer>
  );
}
