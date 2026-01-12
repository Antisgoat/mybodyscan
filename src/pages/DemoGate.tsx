import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import AuthedLayout from "@/layouts/AuthedLayout";
import Home from "@/pages/Home";
import { enableDemo } from "@/state/demo";
import { useAuthUser } from "@/auth/client";

export default function DemoGate() {
  const { user, authReady } = useAuthUser();

  useEffect(() => {
    // Ensure demo mode is enabled as soon as the /demo route is hit.
    enableDemo();
  }, []);

  // Signed-in flows unchanged: if you're already authed, /demo should not force demo mode.
  if (authReady && user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <AuthedLayout>
      <Home />
    </AuthedLayout>
  );
}
