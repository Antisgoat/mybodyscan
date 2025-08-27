export default function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>© 2024 MyBodyScan</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <a href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </a>
            <a href="mailto:support@mybodyscan.com" className="hover:text-foreground transition-colors">
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}