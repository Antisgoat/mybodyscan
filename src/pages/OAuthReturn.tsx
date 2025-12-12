import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";

export default function OAuthReturn() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  const message = error
    ? "We couldn't complete sign-in. Redirecting you back to the app."
    : "Finishing sign-in…";

  useEffect(() => {
    const timer = window.setTimeout(
      () => navigate("/", { replace: true }),
      1200
    );
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Seo
        title="Completing sign-in – MyBodyScan"
        description="Finishing sign-in and returning you to the app."
      />
      <div
        className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin"
        aria-hidden
      />
      <h1 className="text-2xl font-semibold text-foreground">{message}</h1>
      {error ? (
        <p className="text-sm text-muted-foreground">Error: {error}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          You will be redirected shortly.
        </p>
      )}
    </main>
  );
}
