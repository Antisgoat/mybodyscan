import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast as notify } from "@/hooks/use-toast";
import {
  createAccountEmail,
  rememberAuthRedirect,
  consumeAuthRedirect,
  sendReset,
  useAuthUser,
} from "@/lib/auth";
import { auth, firebaseReady } from "@/lib/firebase";
import { warnIfDomainUnauthorized } from "@/lib/firebaseAuthConfig";
import { emailPasswordSignIn, describeAuthErrorAsync, type NormalizedAuthError } from "@/lib/login";
import { toast } from "@/lib/toast";
import { disableDemoEverywhere, enableDemoLocal } from "@/lib/demoState";
import { consumeAuthRedirectError, consumeAuthRedirectResult, type FriendlyFirebaseError } from "@/lib/authRedirect";
import { SocialButtons, type SocialProvider } from "@/auth/components/SocialButtons";

const AppleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 14 17" width="16" height="16" aria-hidden="true" {...props}>
    <path d="M10.24 9.1c.01 2.16 1.86 2.88 1.88 2.89-.01.04-.3 1.03-1 2.03-.6.86-1.23 1.72-2.22 1.74-.97.02-1.28-.56-2.38-.56-1.1 0-1.44.54-2.35.58-.94.04-1.66-.93-2.27-1.79C.68 12.5-.2 10 0 7.66c.13-1.26.73-2.43 1.7-3.11.75-.51 1.67-.73 2.56-.6.6.12 1.1.36 1.48.56.38.2.68.37.88.36.18 0 .5-.18.88-.37.53-.28 1.13-.6 1.93-.6.01 0 .01 0 .02 0 .72.01 2.26.18 3.33 1.77-.09.06-1.98 1.15-1.93 3.43ZM7.3 1.62C7.9.88 8.97.33 9.88.32c.1.98-.29 1.96-.87 2.64C8.4 3.7 7.39 4.28 6.37 4.2c-.1-.96.4-1.98.93-2.58Z" fill="currentColor"/>
  </svg>
);

const Auth = () => {
  const location = useLocation();
  const from = (location.state as any)?.from || "/home";
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const nextParam = searchParams.get("next");
  const defaultTarget = nextParam || from || "/home";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuthUser();
  const demoEnv = String(import.meta.env.VITE_DEMO_ENABLED ?? "true").toLowerCase();
  const demoEnabled = demoEnv !== "false";
  const canonical = typeof window !== "undefined" ? window.location.href : undefined;

  useEffect(() => {
    if (!user) return;
    disableDemoEverywhere();
    if (location.pathname !== defaultTarget) {
      window.location.replace(defaultTarget);
    }
  }, [user, location.pathname, defaultTarget]);

  useEffect(() => {
    warnIfDomainUnauthorized();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await firebaseReady();
      const result = await consumeAuthRedirectResult();
      if (!cancelled && result) {
        const target = consumeAuthRedirect();
        if (target) {
          window.location.replace(target);
          return;
        }
        window.location.replace(defaultTarget);
        return;
      }

      const error = await consumeAuthRedirectError();
      if (!cancelled && error) {
        consumeAuthRedirect();
        const friendly = error as FriendlyFirebaseError;
        const friendlyMessage = friendly.friendlyMessage ?? null;
        const friendlyCode = friendly.friendlyCode ?? error.code;
        if (friendlyMessage) {
          notify({ title: "Sign in failed", description: formatError(friendlyMessage, friendlyCode) });
        } else {
          try {
            const mapped = await describeAuthErrorAsync(auth, error);
            notify({ title: "Sign in failed", description: formatError(mapped.message, mapped.code ?? friendlyCode) });
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn("[auth] Unable to map redirect error", err);
            }
            const fallback = error.message || "Sign in failed";
            notify({ title: "Sign in failed", description: formatError(fallback, friendlyCode) });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultTarget]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const result = await emailPasswordSignIn(email, password);
        if (result.ok === false) {
          toast(formatError(result.message, result.code), "error");
          return;
        }
      } else {
        await createAccountEmail(email, password);
      }
      window.location.replace(defaultTarget);
    } catch (err: unknown) {
      const normalized = normalizeFirebaseError(err);
      const fallback = mode === "signin" ? "Email sign-in failed." : "Account creation failed.";
      toast(formatError(normalized.message ?? fallback, normalized.code), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialBusyChange = useCallback((busy: boolean) => {
    setLoading(busy);
  }, []);

  const handleSocialBefore = useCallback(
    (_provider: SocialProvider) => {
      rememberAuthRedirect(defaultTarget);
    },
    [defaultTarget],
  );

  const handleSocialSuccess = useCallback(
    (_provider: SocialProvider) => {
      const target = consumeAuthRedirect();
      if (target) {
        window.location.replace(target);
        return;
      }
      if (auth.currentUser) {
        window.location.replace(defaultTarget);
      }
    },
    [defaultTarget],
  );

  const handleSocialError = useCallback(
    (_provider: SocialProvider, error: NormalizedAuthError) => {
      consumeAuthRedirect();
      const message = formatError(error.message, error.code);
      toast(message, "error");
    },
    [],
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Seo
        title="Sign In · MyBodyScan"
        description="Access your MyBodyScan account to start and review scans."
        canonical={canonical}
      />
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <div className="text-center">
            <CardTitle className="text-2xl mb-2">{mode === "signin" ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription className="text-slate-600">
              Track body fat, weight and progress — private and secure.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-2 mb-4">
            <Button size="sm" variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
              Sign in
            </Button>
            <Button size="sm" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
              Create account
            </Button>
          </div>
          
          <div className="mb-4 p-4 bg-slate-50 rounded-lg">
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Accurate body-fat estimates from photos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Progress tracking & reminders</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Private by default — your data, your control</span>
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
                  notify({ title: "Reset link sent", description: "Check your email for reset instructions." });
                } catch (err: any) {
                  notify({ title: "Couldn't send reset", description: err?.message || "Please try again." });
                }
              }}>Forgot password?</Button>
            </div>
          </form>
          <SocialButtons
            loading={loading}
            className="space-y-3"
            onBusyChange={handleSocialBusyChange}
            onBeforeSignIn={handleSocialBefore}
            onSignInSuccess={handleSocialSuccess}
            onSignInError={handleSocialError}
            renderApple={({ loading, disabled, onClick }) => {
              const appleButton = (
                <Button
                  variant="secondary"
                  onClick={onClick}
                  disabled={disabled}
                  className="w-full h-11 inline-flex items-center justify-center gap-2"
                  aria-label="Continue with Apple"
                  data-testid="auth-apple-button"
                >
                  <AppleIcon />
                  {loading ? "Continuing…" : "Continue with Apple"}
                </Button>
              );

              if (loading) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full inline-flex">{appleButton}</span>
                    </TooltipTrigger>
                    <TooltipContent>Finishing previous sign-in?</TooltipContent>
                  </Tooltip>
                );
              }

              return appleButton;
            }}
            renderGoogle={({ loading, disabled, onClick }) => (
              <Button
                variant="secondary"
                onClick={onClick}
                disabled={disabled}
                className="w-full h-11 inline-flex items-center justify-center gap-2"
                data-testid="auth-google-button"
                aria-label="Continue with Google"
              >
                {loading ? "Continuing…" : "Continue with Google"}
              </Button>
            )}
          />
          <div className="mt-6">
            {demoEnabled && !user && (
              <div className="mt-4">
                <button
                  type="button"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  onClick={() => { enableDemoLocal(); window.location.assign("/home"); }}
                >
                  Browse the demo (no signup)
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Preview the UI with sample data. Sign up to save your progress.
                </p>
              </div>
            )}
            <div className="mt-4 text-center text-xs text-muted-foreground space-x-2">
              <a href="/privacy" className="underline hover:no-underline">Privacy</a>
              <span>?</span>
              <a href="/terms" className="underline hover:no-underline">Terms</a>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default Auth;

function normalizeFirebaseError(err: unknown): { message?: string; code?: string } {
  if (!err) return {};
  if (typeof err === "string") {
    return { message: err };
  }
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    return { message, code };
  }
  return {};
}

function cleanFirebaseMessage(message?: string): string | undefined {
  if (!message) return undefined;
  let cleaned = message.replace(/^Firebase:\s*/i, "");
  cleaned = cleaned.replace(/\s*\(auth\/[\w-]+\)\.?$/i, "").trim();
  return cleaned || undefined;
}

function formatError(message?: string, code?: string) {
  const cleaned = cleanFirebaseMessage(message) ?? message ?? "Firebase sign-in failed.";
  if (code) {
    return `${cleaned} (${code})`;
  }
  return cleaned;
}

