import { useMemo } from "react";

const SUPPORT_EMAIL = "support@mybodyscan.com";

type Props = {
  message: string;
};

export function FirebaseInitError({ message }: Props) {
  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Setup required</p>
          <h1 className="text-3xl font-bold text-slate-900">Sign-in is temporarily unavailable</h1>
          <p className="text-slate-600">
            We couldn&apos;t finish connecting to Firebase for{" "}
            <span className="font-medium text-slate-900">{origin || "this domain"}</span>. This usually means the host
            isn&apos;t listed under Firebase Auth &rarr; Authorized domains or the web credentials are missing.
          </p>
        </div>

        <div className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-700">Admin checklist</p>
          <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
            <li>Add <strong>{origin || "your custom domain"}</strong> to Firebase Console → Auth → Settings → Authorized domains.</li>
            <li>Verify the <code>VITE_FIREBASE_*</code> variables match the <code>mybodyscan-f3daf</code> project and redeploy.</li>
          </ol>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700 w-full">
          <p className="font-medium">Details</p>
          <p className="break-words">{message || "Unknown configuration error."}</p>
        </div>

        <p className="text-sm text-slate-500">
          Need help? Email{" "}
          <a className="font-medium text-blue-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          and include a screenshot of this page.
        </p>

        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
