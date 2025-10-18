import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { describeFirebaseConfig } from "@/config/firebaseConfig";
import { ALLOWED_HOSTS } from "@/lib/env";
import { useAuthUser, isDemoUser as computeIsDemoUser } from "@/lib/auth";
import { APPLE_OAUTH_ENABLED } from "@/env";
import { getAppCheckToken } from "@/appCheck";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_USER_KEY } from "@/lib/demoFlag";
import { isAppCheckInitialized } from "@/lib/appInit";

export default function DebugOverlay() {
  const location = useLocation();
  const { user } = useAuthUser();
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [appCheckState, setAppCheckState] = useState<"pending" | "present" | "missing">("pending");
  const [appCheckInitialized, setAppCheckInitialized] = useState<boolean>(() => isAppCheckInitialized());
  const [configSnapshot] = useState(() => describeFirebaseConfig());
  const [online, setOnline] = useState<boolean>(() =>
    typeof window === "undefined" ? true : window.navigator.onLine,
  );

  const allowed = useMemo(() => {
    const search = new URLSearchParams(location.search);
    const debugFlag = search.get("debug") === "1";
    const devRole = typeof (claims as any)?.role === "string" && (claims as any).role === "dev";
    const developerEmail = user?.email === "developer@adlrlabs.com";
    return import.meta.env.DEV || debugFlag || devRole || developerEmail;
  }, [location.search, claims, user?.email]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      setOnline(window.navigator.onLine);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setClaims(null);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => {
        if (!cancelled) {
          setClaims(result.claims ?? {});
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setClaims({ error: error?.message ?? "Unable to load claims" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    getAppCheckToken(false)
      .then((token) => {
        if (!cancelled) {
          setAppCheckState(token ? "present" : "missing");
          setAppCheckInitialized(isAppCheckInitialized());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppCheckState("missing");
          setAppCheckInitialized(isAppCheckInitialized());
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const host = typeof window !== "undefined" ? window.location.host : "ssr";
  const isDemo = computeIsDemoUser(user);
  const appleEnvEnabled =
    import.meta.env.APPLE_OAUTH_ENABLED === "true" || import.meta.env.VITE_APPLE_OAUTH_ENABLED === "true";
  const providers = useMemo(
    () => [
      { id: "email", label: "Email/password", visible: true },
      { id: "google", label: "Google", visible: true },
      { id: "apple", label: "Apple", visible: APPLE_OAUTH_ENABLED || appleEnvEnabled },
    ],
    [appleEnvEnabled],
  );
  const demoFlag = useMemo(() => {
    if (typeof window === "undefined") return "n/a";
    try {
      return window.localStorage?.getItem(DEMO_USER_KEY) === "1" ? "yes" : "no";
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[debug] Unable to read demo local flag", error);
      }
      return "error";
    }
  }, [user?.uid]);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full">
          <CardHeader>
            <CardTitle>Debug overlay locked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>This diagnostics overlay is only available in development or when the URL includes <code>?debug=1</code>.</p>
            <p>Append <code>?debug=1</code> to the address bar to enable it temporarily.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">Runtime diagnostics</h1>
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Host:</span> {host}
            </p>
            <p>
              <span className="font-medium">Online:</span> {online ? "yes" : "no"}
            </p>
            <div>
              <p className="font-medium">Allowed auth hosts</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {ALLOWED_HOSTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Providers visible</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {providers.map((provider) => (
                  <li key={provider.id} className={provider.visible ? "text-foreground" : "opacity-60"}>
                    {provider.label}: {provider.visible ? "visible" : "hidden"}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Firebase config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Project:</span> {configSnapshot.projectId}
            </p>
            <p>
              <span className="font-medium">App ID:</span> {configSnapshot.appId}
            </p>
            <p>
              <span className="font-medium">Auth domain:</span> {configSnapshot.authDomain}
            </p>
            <p>
              <span className="font-medium">Bucket:</span> {configSnapshot.storageBucket}
            </p>
            {configSnapshot.normalizedFrom ? (
              <p className="text-xs text-muted-foreground">
                Normalized from {configSnapshot.normalizedFrom} → {configSnapshot.storageBucket}
              </p>
            ) : null}
            {configSnapshot.missingEnvKeys.length ? (
              <div>
                <p className="font-medium">Env keys missing before fallback</p>
                <ul className="ml-4 list-disc text-muted-foreground text-xs font-mono">
                  {configSnapshot.missingEnvKeys.map((key) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {configSnapshot.usingFallbackKeys.length ? (
              <p className="text-xs text-muted-foreground">
                Using fallback values for: {configSnapshot.usingFallbackKeys.join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">User:</span> {user ? user.email ?? "anonymous" : "none"}
            </p>
            {user ? (
              <>
                <p>
                  <span className="font-medium">UID:</span> {user.uid}
                </p>
                <p>
                  <span className="font-medium">Anonymous:</span> {user.isAnonymous ? "yes" : "no"}
                </p>
              </>
            ) : null}
            <p>
              <span className="font-medium">Demo user:</span> {isDemo ? "yes" : "no"}
            </p>
            <p>
              <span className="font-medium">Local demo flag ({DEMO_USER_KEY}):</span> {demoFlag}
            </p>
            <div>
              <p className="font-medium">Custom claims</p>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-3 text-xs text-muted-foreground">
                {JSON.stringify(claims ?? {}, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>App Check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Initialized?</span> {appCheckInitialized ? "yes" : "no"}
            </p>
            <p>
              <span className="font-medium">Token present?</span>{" "}
              {appCheckState === "pending" ? "loading…" : appCheckState === "present" ? "yes" : "no"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
