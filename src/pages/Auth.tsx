import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import {
  createAccountEmail,
  signInEmail,
  signInWithGoogle,
  signInWithApple,
  sendReset,
  useAuthUser,
} from "@/lib/auth";
import { enableDemoGuest } from "@/lib/demoFlag";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || "/home";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuthUser();

  useEffect(() => {
    if (user) navigate("/today", { replace: true });
  }, [user, navigate]);

  const appleEnabled = import.meta.env.VITE_APPLE_AUTH_ENABLED === "true";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInEmail(email, password);
      } else {
        await createAccountEmail(email, password);
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      toast({ title: mode === "signin" ? "Sign in failed" : "Create account failed", description: err?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err: any) {
      toast({ title: "Google sign in failed", description: err?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const onApple = async () => {
    setLoading(true);
    try {
      await signInWithApple();
      navigate(from, { replace: true });
    } catch (err: any) {
      toast({ title: "Apple sign in failed", description: err?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Seo title="Sign In – MyBodyScan" description="Access your MyBodyScan account to start and review scans." canonical={window.location.href} />
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <div className="text-center">
            <CardTitle className="text-2xl mb-2">{mode === "signin" ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription className="text-slate-600">Track body fat, weight and progress—private and secure.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-2 mb-6">
            <Button size="sm" variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
              Sign in
            </Button>
            <Button size="sm" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
              Create account
            </Button>
          </div>
          
          <div className="mb-6 p-4 bg-slate-50 rounded-lg">
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Accurate body fat estimates from photos/video</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Progress tracking & reminders</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Private by default—your data, your control</span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Button type="submit" className="mbs-btn mbs-btn-primary w-full" disabled={loading}>
                {loading ? (mode === "signin" ? "Signing in..." : "Creating...") : (mode === "signin" ? "Sign in" : "Create account")}
              </Button>
              <Button type="button" variant="link" onClick={async () => {
                try {
                  await sendReset(email);
                  toast({ title: "Reset link sent", description: "Check your email for reset instructions." });
                } catch (err: any) {
                  toast({ title: "Couldn't send reset", description: err?.message || "Please try again." });
                }
              }}>Forgot password?</Button>
            </div>
          </form>
            <div className="mt-4 grid gap-2">
              {appleEnabled && (
                <Button
                  variant="secondary"
                  onClick={onApple}
                  disabled={loading}
                >
                  Continue with Apple
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={onGoogle}
                disabled={loading}
              >
                Continue with Google
              </Button>
            </div>
            <div className="mt-4">
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  enableDemoGuest();
                  navigate("/today");
                }}
              >
                👀 Explore demo (no sign-up)
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Browse demo data. Create a free account to unlock scanning and save your progress.
              </p>
            </div>
        </CardContent>
      </Card>
      <div className="mt-4 text-center text-xs text-muted-foreground">
        <a href="/legal/privacy" className="underline hover:text-primary">Privacy</a> · 
        <a href="/legal/terms" className="underline hover:text-primary">Terms</a>
      </div>
    </main>
  );
};

export default Auth;

