import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import {
  createAccountEmail,
  rememberAuthRedirect,
  consumeAuthRedirect,
  resolveAuthRedirect,
  sendReset,
  useAuthUser,
  shouldUsePopupAuth,
  formatAuthError,
  finalizeAppleProfile,
  isHostAllowed,
} from "@/lib/auth";
import { safeEmailSignIn } from "@/lib/firebase";
import { getAuthSafe } from "@/lib/appInit";
import {
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  type Auth as FirebaseAuth,
  type AuthProvider,
  type UserCredential,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { isProviderEnabled, loadFirebaseAuthClientConfig } from "@/lib/firebaseAuthConfig";
import { APPLE_OAUTH_ENABLED, OAUTH_AUTHORIZED_HOSTS } from "@/env";
import { getAppCheckToken, isAppCheckActive } from "@/appCheck";
import { persistDemoFlags } from "@/lib/demoFlag";
import { getFirebaseConfigMissingEnvKeys } from "@/config/firebaseConfig";
import { Loader2 } from "lucide-react";
import { getFirebaseErrorCode, humanizeFirebaseError, isProviderConfigurationError } from "@/lib/firebaseErrors";

const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/operation-not-supported-in-this-environment",
  "auth/network-request-failed",
]);

async function emitEmailSignInDiagnostics(mode: "signin" | "signup", error: any) {
  const host = typeof window !== "undefined" ? window.location.host : "n/a";
  const code = typeof error?.code === "string" ? error.code : "unknown";
  const message = typeof error?.message === "string" ? error.message : String(error ?? "Unknown error");

  const appCheckActive = isAppCheckActive();
  let tokenPresent = false;
  try {
    const token = await getAppCheckToken(false);
    tokenPresent = typeof token === "string" && token.length > 0;
  } catch (tokenError) {
    if (import.meta.env.DEV) {
      console.warn("[auth] Unable to verify App Check token during diagnostics", tokenError);
    }
  }

  const summary = `Host: ${host} · App Check: ${appCheckActive ? (tokenPresent ? "token" : "no token") : "inactive"} · Code: ${code}`;

  try {
    toast({
      title: mode === "signin" ? "Sign-in diagnostics" : "Account creation diagnostics",
      description: summary,
    });
  } catch (toastError) {
    if (import.meta.env.DEV) {
      console.warn("[auth] Unable to surface diagnostics toast", toastError);
    }
  }

  console.info("[auth] email auth diagnostics", {
    flow: mode,
    host,
    appCheckActive,
    appCheckTokenPresent: tokenPresent,
    code,
    message,
  });
}

function normalizeHostCandidate(value?: string | null): string {
  if (!value) return "";
  return value.replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0]?.trim().toLowerCase() ?? "";
}

function matchesAuthorizedHost(candidate: string, hostname: string): boolean {
  const normalizedCandidate = normalizeHostCandidate(candidate);
  const normalizedHost = normalizeHostCandidate(hostname);
  if (!normalizedCandidate || !normalizedHost) return false;
  if (normalizedCandidate === normalizedHost) return true;
  return normalizedHost.endsWith(`.${normalizedCandidate}`);
}

type ProviderSignInResult =
  | { status: "popup"; credential: UserCredential }
  | { status: "redirect"; credential: null };

type ConfigErrorState = {
  code: string;
  host: string;
  missingEnvKeys: string[];
  message: string;
};

async function waitForDomReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (document.readyState === "complete") return;
  await new Promise<void>((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

function extractMissingEnvKeys(error: unknown): string[] {
  const fromError = Array.isArray((error as any)?.missingEnvKeys)
    ? (error as any).missingEnvKeys
    : null;
  const candidates = Array.isArray(fromError) && fromError.length > 0 ? fromError : (() => {
    try {
      return getFirebaseConfigMissingEnvKeys();
    } catch (metaError) {
      if (import.meta.env.DEV) {
        console.warn("[auth] Unable to read Firebase config meta", metaError);
      }
      return [] as string[];
    }
  })();

  return Array.from(
    new Set(
      (candidates as unknown[])
        .map((value) => (typeof value === "string" ? value : ""))
        .filter((value) => value.length > 0),
    ),
  );
}

async function signInWithProvider(
  auth: FirebaseAuth,
  provider: AuthProvider,
  options?: { preferPopup?: boolean; finalize?: (credential: UserCredential | null) => Promise<void> | void },
): Promise<ProviderSignInResult> {
  await waitForDomReady();
  const preferPopup = options?.preferPopup ?? shouldUsePopupAuth();
  if (!preferPopup) {
    await signInWithRedirect(auth, provider);
    return { status: "redirect", credential: null };
  }

  let retriedNetwork = false;
  while (true) {
    try {
      const credential = await signInWithPopup(auth, provider);
      await options?.finalize?.(credential);
      return { status: "popup", credential };
    } catch (error: any) {
      const code = typeof error?.code === "string" ? error.code : "";
      if (code === "auth/network-request-failed" && !retriedNetwork) {
        retriedNetwork = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      if (!code || !POPUP_FALLBACK_CODES.has(code)) {
        throw error;
      }
      break;
    }
  }

  await signInWithRedirect(auth, provider);
  return { status: "redirect", credential: null };
}

const AppleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 14 17" width="16" height="16" aria-hidden="true" {...props}>
    <path d="M10.24 9.1c.01 2.16 1.86 2.88 1.88 2.89-.01.04-.3 1.03-1 2.03-.6.86-1.23 1.72-2.22 1.74-.97.02-1.28-.56-2.38-.56-1.1 0-1.44.54-2.35.58-.94.04-1.66-.93-2.27-1.79C.68 12.5-.2 10 0 7.66c.13-1.26.73-2.43 1.7-3.11.75-.51 1.67-.73 2.56-.6.6.12 1.1.36 1.48.56.38.2.68.37.88.36.18 0 .5-.18.88-.37.53-.28 1.13-.6 1.93-.6.01 0 .01 0 .02 0 .72.01 2.26.18 3.33 1.77-.09.06-1.98 1.15-1.93 3.43ZM7.3 1.62C7.9.88 8.97.33 9.88.32c.1.98-.29 1.96-.87 2.64C8.4 3.7 7.39 4.28 6.37 4.2c-.1-.96.4-1.98.93-2.58Z" fill="currentColor"/>
  </svg>
);

const GoogleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M12.24 10.32v3.44h4.76c-.2 1.11-1.44 3.27-4.76 3.27-2.86 0-5.2-2.37-5.2-5.28s2.34-5.28 5.2-5.28c1.63 0 2.72.69 3.35 1.28l2.28-2.2C16.72 4.34 14.7 3.4 12.24 3.4 7.7 3.4 4 7.05 4 11.75S7.7 20.1 12.24 20.1c4.32 0 7.18-3.03 7.18-7.31 0-.49-.05-.86-.11-1.24Z"
      fill="currentColor"
    />
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || "/today";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [appleEnabled, setAppleEnabled] = useState<boolean | null>(null);
  const forceAppleButton = import.meta.env.VITE_FORCE_APPLE_BUTTON === "true";
  const [providerLoading, setProviderLoading] = useState<null | "google" | "apple">(null);
  const [lastOauthError, setLastOauthError] = useState<
    | { provider: string; code?: string; message: string }
    | null
  >(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [configError, setConfigError] = useState<ConfigErrorState | null>(null);
  const [hostAuthorized, setHostAuthorized] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return isHostAllowed(window.location.hostname);
  });
  const [reachability, setReachability] = useState<"checking" | "online" | "offline">("checking");
  const [appleSetupNote, setAppleSetupNote] = useState<string | null>(null);
  const appleEnvEnabled =
    import.meta.env.APPLE_OAUTH_ENABLED === "true" || import.meta.env.VITE_APPLE_OAUTH_ENABLED === "true";
  const appleFeatureEnabled = APPLE_OAUTH_ENABLED || appleEnvEnabled;
  const { user } = useAuthUser();
  const authDisabled = !hostAuthorized;
  const reachabilityLabel = useMemo(() => {
    if (reachability === "checking") return "Checking network…";
    return reachability === "online" ? "Online" : "Offline";
  }, [reachability]);
  const reachabilityTone = useMemo(() => {
    if (reachability === "online") return "text-emerald-600";
    if (reachability === "offline") return "text-destructive";
    return "text-muted-foreground";
  }, [reachability]);

  const handleConfigFailure = useCallback((error: any) => {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code !== "auth/api-key-not-valid" && code !== "config/missing-firebase-config") {
      return null;
    }
    const host = typeof window !== "undefined" ? window.location.host : "unknown";
    const missingEnvKeys = extractMissingEnvKeys(error);
    const message = `Firebase configuration missing or invalid for this host (${host}).`;
    setConfigError((prev) => {
      const combinedMissing = Array.from(new Set([...(prev?.missingEnvKeys ?? []), ...missingEnvKeys]));
      return { code, host, missingEnvKeys: combinedMissing, message };
    });
    return { code, message, missingEnvKeys };
  }, [setConfigError]);

  useEffect(() => {
    if (!user) return;
    const defaultTarget = (location.state as any)?.from || "/today";
    if (location.pathname !== defaultTarget) {
      navigate(defaultTarget, { replace: true });
    }
  }, [user, navigate, location.pathname, location.state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hostname = window.location.hostname;
    if (isHostAllowed(hostname)) {
      setHostAuthorized(true);
      return;
    }
    const oauthAuthorized = (OAUTH_AUTHORIZED_HOSTS ?? []).some((candidate) =>
      matchesAuthorizedHost(candidate, hostname),
    );
    setHostAuthorized(oauthAuthorized);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const applyStatus = (status: "online" | "offline" | "checking") => {
      if (!cancelled) {
        setReachability(status);
      }
    };
    const updateFromNavigator = () => {
      applyStatus(window.navigator.onLine ? "online" : "offline");
    };
    updateFromNavigator();
    fetch("https://www.googleapis.com/robots.txt", { mode: "no-cors" })
      .then(() => applyStatus("online"))
      .catch(() => applyStatus("offline"));
    window.addEventListener("online", updateFromNavigator);
    window.addEventListener("offline", updateFromNavigator);
    return () => {
      cancelled = true;
      window.removeEventListener("online", updateFromNavigator);
      window.removeEventListener("offline", updateFromNavigator);
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (!active) return;
        setAppleEnabled(isProviderEnabled("apple.com", config));
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[auth] Unable to determine Apple availability:", err);
        }
        if (active) {
          setAppleEnabled(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getAuthSafe();
      } catch (error) {
        if (cancelled) return;
        handleConfigFailure(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleConfigFailure]);

  const handleOauthError = useCallback(
    (providerLabel: string, error: any) => {
      const configIssue = handleConfigFailure(error);
      if (configIssue) {
        const missingList = configIssue.missingEnvKeys.length
          ? ` Missing env keys: ${configIssue.missingEnvKeys.join(", ")}.`
          : "";
        const description = `${configIssue.message}${missingList} See README → Firebase Web config.`;
        toast({ title: "Firebase config missing", description });
        setLastOauthError({
          provider: providerLabel,
          code: configIssue.code,
          message: `${configIssue.message}${missingList}`.trim(),
        });
        return;
      }

      const code = typeof error?.code === "string" ? error.code : undefined;
      const hostname = typeof window !== "undefined" ? window.location.hostname : "";
      if (code === "auth/unauthorized-domain") {
        const guidanceHost = hostname || "this domain";
        const description = `Add ${guidanceHost} to Firebase > Auth > Settings > Authorized domains, then retry. (${code})`;
        toast({ title: "Authorize this domain", description });
        setLastOauthError({ provider: providerLabel, code, message: description });
        return;
      }

      const formatted = formatAuthError(providerLabel, error);
      toast({ title: `${providerLabel} sign-in failed`, description: formatted });
      setLastOauthError({ provider: providerLabel, code, message: formatted });
    },
    [handleConfigFailure],
  );

  useEffect(() => {
    if (authDisabled) {
      return () => {
        /* noop */
      };
    }
    let active = true;
    (async () => {
      try {
        const authInstance = await getAuthSafe();
        const result = await resolveAuthRedirect(authInstance);
        if (!active || !result) return;
        setLastOauthError(null);
        const target = consumeAuthRedirect();
        if (target) {
          navigate(target, { replace: true });
        }
      } catch (err: any) {
        if (!active) return;
        consumeAuthRedirect();
        const configIssue = handleConfigFailure(err);
        if (configIssue) {
          setLastOauthError({ provider: "Sign-in", code: configIssue.code, message: configIssue.message });
          return;
        }
        handleOauthError("Sign-in", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate, authDisabled, handleOauthError, handleConfigFailure]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoLoading) {
      return;
    }
    if (authDisabled) {
      setFormError("Sign-in is disabled on this domain.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await safeEmailSignIn(email, password);
      } else {
        await createAccountEmail(email, password);
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      const configIssue = handleConfigFailure(err);
      if (configIssue) {
        const missingList = configIssue.missingEnvKeys.length
          ? ` Missing env keys: ${configIssue.missingEnvKeys.join(", ")}.`
          : "";
        const description = `${configIssue.message}${missingList} See README → Firebase Web config.`;
        setFormError(`${configIssue.message}${missingList}`.trim());
        toast({ title: "Firebase config missing", description });
        setLastOauthError({
          provider: mode === "signin" ? "Email" : "Email signup",
          code: configIssue.code,
          message: `${configIssue.message}${missingList}`.trim(),
        });
        void emitEmailSignInDiagnostics(mode, err);
        return;
      }
      const code = err?.code ?? "unknown";
      const message = err?.message ?? "Unknown error";
      const prefix = mode === "signin" ? "Sign-in failed" : "Create account failed";
      setFormError(`${prefix} (${code}). ${message}`);
      console.error("Sign-in error:", err);
      if (mode === "signup") {
        toast({
          title: "Create account failed",
          description: formatAuthError("Email", err),
        });
      }
      void emitEmailSignInDiagnostics(mode, err);
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    if (loading || demoLoading) return;
    if (authDisabled) {
      toast({
        title: "Sign-in blocked",
        description: "This domain isn’t authorized for Google sign-in.",
      });
      return;
    }
    setLoading(true);
    setProviderLoading("google");
    setLastOauthError(null);
    try {
      rememberAuthRedirect(from);
      const authInstance = await getAuthSafe();
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters?.({ prompt: "select_account" });
      const result = await signInWithProvider(authInstance, googleProvider, {
        preferPopup: shouldUsePopupAuth(),
      });
      if (result.status === "popup") {
        consumeAuthRedirect();
        setLastOauthError(null);
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      consumeAuthRedirect();
      console.error("Google sign-in failed:", err);
      if (getFirebaseErrorCode(err) === "auth/popup-blocked") {
        toast({ title: "Enable popups", description: "Enable popups to continue Google sign-in." });
      } else {
        handleOauthError("Google", err);
      }
    } finally {
      setProviderLoading(null);
      setLoading(false);
    }
  };

  const anonWithRetry = useCallback(async () => {
    const authInstance = await getAuthSafe();
    const tryOnce = () => signInAnonymously(authInstance);
    try {
      return await tryOnce();
    } catch (error) {
      if (getFirebaseErrorCode(error) === "auth/network-request-failed") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        return await tryOnce();
      }
      throw error;
    }
  }, []);

  const onExploreDemo = async () => {
    if (demoLoading || loading) return;
    if (authDisabled) {
      toast({
        title: "Demo unavailable",
        description: "This domain isn’t authorized for authentication.",
      });
      return;
    }
    setDemoLoading(true);
    setLastOauthError(null);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        toast({
          title: "Offline",
          description: "You’re offline — reconnect to start the demo.",
        });
        return;
      }
      await anonWithRetry();
      try {
        persistDemoFlags();
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[auth] unable to persist demo flags", error);
        }
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage?.setItem("mbs_demo", "1");
          window.localStorage?.setItem("isDemoUser", "1");
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn("[auth] unable to mark demo local storage", error);
          }
        }
      }
      navigate("/coach", { replace: true });
    } catch (err: any) {
      const configIssue = handleConfigFailure(err);
      if (configIssue) {
        const missingList = configIssue.missingEnvKeys.length
          ? ` Missing env keys: ${configIssue.missingEnvKeys.join(", ")}.`
          : "";
        const description = `${configIssue.message}${missingList} See README → Firebase Web config.`;
        toast({ title: "Firebase config missing", description });
        setLastOauthError({ provider: "Demo", code: configIssue.code, message: `${configIssue.message}${missingList}`.trim() });
      } else {
        console.error("Demo explore failed:", err);
        const description = formatAuthError("Demo", err);
        toast({ title: "Demo unavailable", description, variant: "destructive" });
      }
    } finally {
      setDemoLoading(false);
    }
  };

  const appleConfigured = appleEnabled === true;
  const showAppleButton = forceAppleButton || appleFeatureEnabled || appleConfigured;

  const handleAppleFeatureDisabled = () => {
    const message = "Apple Sign-In not yet enabled for this domain. Flip APPLE_OAUTH_ENABLED to true after finishing setup.";
    toast({ title: "Apple Sign-In not yet enabled for this domain", description: message });
    setLastOauthError({ provider: "Apple", code: "apple/feature-disabled", message });
  };

  const onApple = async () => {
    if (loading || demoLoading) return;

    if (authDisabled) {
      toast({
        title: "Sign-in blocked",
        description: "This domain isn’t authorized for Apple sign-in.",
      });
      return;
    }

    if (!appleFeatureEnabled) {
      handleAppleFeatureDisabled();
      return;
    }

    setAppleSetupNote(null);
    setLoading(true);
    setProviderLoading("apple");
    setLastOauthError(null);
    const appleProvider = new OAuthProvider("apple.com");
    appleProvider.addScope("email");
    appleProvider.addScope("name");
    try {
      rememberAuthRedirect(from);
      const authInstance = await getAuthSafe();
      const credential = await signInWithPopup(authInstance, appleProvider);
      await finalizeAppleProfile(credential);
      setLastOauthError(null);
      navigate(from, { replace: true });
    } catch (err: any) {
      const code = getFirebaseErrorCode(err);
      if (code === "auth/popup-blocked") {
        toast({ title: "Enable popups", description: "Allow popups to continue with Apple sign-in." });
        setLastOauthError({ provider: "Apple", code, message: "Popup blocked." });
      } else if (code === "auth/account-exists-with-different-credential") {
        const message = humanizeFirebaseError(err);
        toast({ title: "Use your existing provider", description: message, variant: "destructive" });
        setLastOauthError({ provider: "Apple", code, message });
      } else if (isProviderConfigurationError(err)) {
        const message =
          "Apple sign-in needs Services ID, Team ID, Key ID and .p8 uploaded in Firebase Auth. Redirects: https://mybodyscanapp.com/__/auth/handler, https://www.mybodyscanapp.com/__/auth/handler, https://mybodyscan-f3daf.web.app/__/auth/handler.";
        toast({ title: "Configure Apple sign-in", description: message });
        setAppleSetupNote(message);
        setLastOauthError({ provider: "Apple", code: code || "apple/not-configured", message });
      } else {
        console.error("Apple sign-in failed:", err);
        const message = humanizeFirebaseError(err);
        toast({ title: "Apple sign-in failed", description: message });
        setLastOauthError({ provider: "Apple", code: code || "apple/unknown", message });
      }
    } finally {
      setProviderLoading(null);
      setLoading(false);
    }
  };

  const appleHelperMessage = appleSetupNote
    ? appleSetupNote
    : !appleFeatureEnabled
    ? "Apple Sign-In is disabled here until APPLE_OAUTH_ENABLED is set to true."
    : !appleConfigured && appleEnabled === false
    ? "Finish the Apple provider setup in Firebase Auth (service ID, redirect URL, key) before enabling users."
    : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Seo title="Sign In – MyBodyScan" description="Access your MyBodyScan account to start and review scans." canonical={window.location.href} />
      <div className="w-full max-w-md">
        {configError ? (
          <div
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <p>
              Firebase configuration invalid for this host ({configError.host}). Check .env and Authorized domains.
            </p>
            {configError.missingEnvKeys.length ? (
              <ul className="mt-2 list-disc list-inside space-y-1 text-xs font-mono">
                {configError.missingEnvKeys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2">
              See
              {" "}
              <a
                href="https://github.com/Antisgoat/mybodyscan/blob/main/README.md#firebase-web-config"
                className="underline hover:no-underline"
                target="_blank"
                rel="noreferrer noopener"
              >
                Firebase Web config
              </a>
              {" "}
              for setup details.
            </p>
          </div>
        ) : null}
        {!hostAuthorized && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This domain isn’t in Firebase Authorized Domains. OAuth popups may be blocked.
          </div>
        )}
        <Card className="w-full shadow-md">
          <CardHeader>
          <div className="text-center">
            <CardTitle className="text-2xl mb-2">{mode === "signin" ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription className="text-slate-600">Track body fat, weight and progress—private and secure.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="mb-4 flex items-center justify-between text-xs text-muted-foreground"
            data-testid="auth-network-status"
          >
            <span>Connectivity</span>
            <span className={`font-medium ${reachabilityTone}`}>{reachabilityLabel}</span>
          </div>
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

          {formError ? (
            <div
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </div>
          ) : null}

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
              <Button
                type="submit"
                className="mbs-btn mbs-btn-primary w-full"
                disabled={loading || authDisabled || demoLoading}
              >
                {loading
                  ? mode === "signin"
                    ? "Signing in..."
                    : "Creating..."
                  : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
              </Button>
              <Button
                type="button"
                variant="link"
                disabled={loading || authDisabled || demoLoading}
                onClick={async () => {
                  if (authDisabled) {
                    toast({
                      title: "Reset unavailable",
                      description: "This domain isn’t authorized for account actions.",
                    });
                    return;
                  }
                  try {
                    await sendReset(email);
                    toast({ title: "Reset link sent", description: "Check your email for reset instructions." });
                  } catch (err: any) {
                    toast({ title: "Couldn't send reset", description: err?.message || "Please try again." });
                  }
                }}
              >
                Forgot password?
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {showAppleButton ? (
              <div className="space-y-2" data-testid="auth-apple-button-wrapper">
                <Button
                  variant="secondary"
                  onClick={onApple}
                  disabled={loading || authDisabled || demoLoading}
                  className="w-full h-11 inline-flex items-center justify-center gap-2"
                  aria-label="Continue with Apple"
                  data-testid="auth-apple-button"
                >
                  {providerLoading === "apple" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AppleIcon className="h-4 w-4" />
                  )}
                  <span>Continue with Apple</span>
                </Button>
                {appleHelperMessage ? (
                  <p className="text-xs text-muted-foreground text-center">{appleHelperMessage}</p>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="secondary"
              onClick={onGoogle}
              disabled={loading || authDisabled || demoLoading}
              className="w-full h-11 inline-flex items-center justify-center gap-2"
              data-testid="auth-google-button"
            >
              {providerLoading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              <span>Continue with Google</span>
            </Button>
          </div>
          <Collapsible open={supportOpen} onOpenChange={setSupportOpen} className="mt-2">
            <div className="text-center">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-primary focus:outline-none"
                >
                  Having trouble?
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2 text-xs text-muted-foreground space-y-2">
              {lastOauthError ? (
                <div className="rounded-md border border-muted bg-muted/40 p-3 text-left">
                  <p className="font-medium text-foreground">{lastOauthError.provider} sign-in details</p>
                  <p className="mt-1 break-words">{lastOauthError.message}</p>
                  {lastOauthError.code ? (
                    <p className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">{lastOauthError.code}</p>
                  ) : null}
                </div>
              ) : (
                <p>No recent OAuth errors. We’ll surface details here if a provider fails.</p>
              )}
            </CollapsibleContent>
          </Collapsible>
          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 inline-flex items-center justify-center gap-2"
              onClick={onExploreDemo}
              disabled={demoLoading || loading || providerLoading !== null || authDisabled}
            >
              {demoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span role="img" aria-hidden="true">👀</span>}
              <span>Explore demo (no sign-up)</span>
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Browse demo data in read-only mode. Create a free account to unlock scanning and save your progress.
            </p>
            <div className="mt-4 text-center text-xs text-muted-foreground space-x-2">
              <a href="/privacy" className="underline hover:no-underline">Privacy</a>
              <span>·</span>
              <a href="/terms" className="underline hover:no-underline">Terms</a>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Auth;

