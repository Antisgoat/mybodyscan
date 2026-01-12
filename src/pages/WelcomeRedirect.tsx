import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuthUser } from "@/auth/mbs-auth";

const WelcomeRedirect = () => {
  const [countdown, setCountdown] = useState(1.5);
  const { user, authReady } = useAuthUser();
  const demoRequested = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("demo") === "1";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 0.1));
    }, 100);

    return () => clearInterval(timer);
  }, [user]);

  if (!authReady) {
    return null;
  }

  if (!user) {
    // Demo mode must be accessible without auth.
    if (demoRequested) {
      return <Navigate to="/demo" replace />;
    }
    return <Navigate to="/auth" replace />;
  }

  if (countdown <= 0) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="text-center space-y-2">
        <div className="text-muted-foreground">Taking you to the app...</div>
        <div className="w-32 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-100 ease-out"
            style={{ width: `${((1.5 - countdown) / 1.5) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default WelcomeRedirect;
