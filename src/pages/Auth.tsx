import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { createAccountEmail, signInEmail, signInGoogle, sendReset, signInGuest } from "@/lib/auth";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || "/home";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
      await signInGoogle();
      navigate(from, { replace: true });
    } catch (err: any) {
      toast({ title: "Google sign in failed", description: err?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const onGuest = async () => {
    setLoading(true);
    try {
      await signInGuest();
      navigate(from, { replace: true });
    } catch (err: any) {
      toast({ title: "Guest sign in failed", description: err?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Seo title="Sign In – MyBodyScan" description="Access your MyBodyScan account to start and review scans." canonical={window.location.href} />
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
              <CardDescription>Welcome to MyBodyScan</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
                Sign in
              </Button>
              <Button size="sm" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
                Create account
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex items-center justify-between">
              <Button type="submit" className="" disabled={loading}>
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
            <Button variant="secondary" onClick={onGoogle} disabled={loading}>Continue with Google</Button>
            <Button variant="outline" onClick={onGuest} disabled={loading}>Continue as guest</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default Auth;

