import { ReactNode, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { app } from "@/firebaseConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signInWithGoogle, signInGuest } from "@/lib/auth";

const AuthGate = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(app), (user) => {
      setAuthed(!!user);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-muted border-t-primary animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={signInWithGoogle}>Sign in with Google</Button>
            <button
              className="text-sm underline text-primary hover:opacity-80 text-left"
              onClick={signInGuest}
            >
              Continue as guest
            </button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
};

export default AuthGate;
