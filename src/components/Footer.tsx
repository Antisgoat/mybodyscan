import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>© 2024 MyBodyScan</span>
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