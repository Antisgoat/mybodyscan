import { Button } from "@/components/ui/button";
import type { IdentityToolkitProbeStatus } from "@/lib/firebase/runtimeConfig";

type ConfigStatus = {
  tone: "warning" | "ok" | "error";
  message: string;
};

type SelfTestStatus = {
  state: "idle" | "running" | "ok" | "error";
  message?: string;
  results?: Array<{
    id: string;
    label: string;
    url: string;
    ok: boolean;
    status?: number;
    error?: string;
  }>;
};

type AuthDebugPanelProps = {
  origin: string;
  config: Record<string, unknown>;
  hasFirebaseConfig: boolean;
  firebaseConfigMissingKeys: string[];
  firebaseConfigWarningKeys: string[];
  firebaseInitError: string | null;
  identityProbe: IdentityToolkitProbeStatus | null;
  authError: string | null;
  initAuthState: { lastError: string | null };
  userEmail?: string | null;
  userUid?: string | null;
  configStatus: ConfigStatus;
  configDetailsOpen: boolean;
  onToggleConfigDetails: () => void;
  onRunNetworkSelfTest: () => void;
  selfTestStatus: SelfTestStatus;
};

export function AuthDebugPanel({
  origin,
  config,
  hasFirebaseConfig,
  firebaseConfigMissingKeys,
  firebaseConfigWarningKeys,
  firebaseInitError,
  identityProbe,
  authError,
  initAuthState,
  userEmail,
  userUid,
  configStatus,
  configDetailsOpen,
  onToggleConfigDetails,
  onRunNetworkSelfTest,
  selfTestStatus,
}: AuthDebugPanelProps) {
  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onToggleConfigDetails}
        >
          {configDetailsOpen ? "Hide config status" : "Show config status"}
        </Button>
      </div>
      {configDetailsOpen && (
        <div
          className={`mb-3 rounded-md border p-3 text-xs ${
            configStatus.tone === "warning"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : configStatus.tone === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-muted bg-muted/30 text-muted-foreground"
          }`}
        >
          <div className="font-semibold text-sm">
            {configStatus.tone === "warning" ? "Config warning" : "Config status"}
          </div>
          <div className="mt-1">{configStatus.message}</div>
          {identityProbe?.status === "warning" && (
            <div className="mt-1 text-[11px] text-amber-800">
              IdentityToolkit clientConfig returned a warning (404/403). Login
              continues; add this origin to Firebase Auth authorized domains if
              needed.
            </div>
          )}
          {identityProbe == null && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Probing runtime configuration…
            </div>
          )}
        </div>
      )}
      <div className="mt-6 rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground space-y-1">
        <div className="font-semibold text-xs text-foreground">Debug info</div>
        <div>Origin: {origin}</div>
        <div>Project ID: {(config.projectId as string) || "(unknown)"}</div>
        <div>Auth domain: {(config.authDomain as string) || "(unknown)"}</div>
        <div>Has config: {String(hasFirebaseConfig)}</div>
        <div>
          Missing config:{" "}
          {firebaseConfigMissingKeys.length
            ? firebaseConfigMissingKeys.join(", ")
            : "none"}
        </div>
        <div>
          Optional missing:{" "}
          {firebaseConfigWarningKeys.length
            ? firebaseConfigWarningKeys.join(", ")
            : "none"}
        </div>
        <div>
          IdentityToolkit probe: {identityProbe?.status || "pending"}
          {identityProbe?.statusCode ? ` (${identityProbe.statusCode})` : ""}
        </div>
        <div>
          Current user: {userEmail || "(none)"} · UID: {userUid || "-"}
        </div>
        <div>Last auth error: {authError || firebaseInitError || "none"}</div>
        <div>Auth init last error: {initAuthState.lastError || "none"}</div>
        <div className="pt-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={onRunNetworkSelfTest}
            disabled={selfTestStatus.state === "running"}
          >
            {selfTestStatus.state === "running"
              ? "Testing network..."
              : "Run network self-test"}
          </Button>
          <div className="mt-1 text-[11px]">
            Network test:{" "}
            {selfTestStatus.state === "idle"
              ? "not run"
              : selfTestStatus.state === "ok"
                ? `ok (${selfTestStatus.message ?? "success"})`
                : selfTestStatus.state === "running"
                  ? "running"
                  : `failed (${selfTestStatus.message ?? "error"})`}
          </div>
          {selfTestStatus.results?.length ? (
            <ul className="mt-2 space-y-1">
              {selfTestStatus.results.map((result) => (
                <li key={result.id}>
                  {result.label}:{" "}
                  {result.ok
                    ? `ok (${result.status ?? "status"})`
                    : `failed (${result.error ?? "error"})`}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </>
  );
}
