import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";

export default function NotFound() {
  const location = useLocation();
  useEffect(() => {
    console.warn("route_not_found", { path: location.pathname });
  }, [location.pathname]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you’re looking for doesn’t exist or was moved.</p>
        <div className="flex justify-center gap-2">
          <Link className="underline" to="/home">Go home</Link>
        </div>
      </div>
    </main>
  );
}
