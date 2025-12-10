/**
 * Pipeline map — Meals search & logging:
 * - Pulls USDA/OpenFood results through `nutritionSearch` callable, showing AppCheck/system health gating.
 * - Allows barcode scan or manual search, then uses `ServingEditor` to capture servings.
 * - Calls `addMeal` Cloud Function so Firestore `nutritionLogs/{day}` stays authoritative and totals update instantly.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import BarcodeScannerSheet from "@/features/barcode/BarcodeScanner";
import { cameraAvailable, isSecureContextOrLocal } from "@/features/barcode/useZxing";
import { nutritionSearch, type FoodItem } from "@/lib/api/nutrition";
import { useAuthUser } from "@/lib/useAuthUser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useDemoMode } from "@/components/DemoModeProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ServingEditor } from "@/components/nutrition/ServingEditor";
import { addMeal, type MealEntry } from "@/lib/nutritionBackend";
import { toast } from "@/hooks/use-toast";
import { demoToast } from "@/lib/demoToast";

type NutritionSearchProps = {
  onMealLogged?: (item: FoodItem) => void;
};

export default function NutritionSearch({ onMealLogged }: NutritionSearchProps = {}) {
  const { loading: authLoading, user } = useAuthUser();
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const demo = useDemoMode();
  const nutritionEnabled = !demo && nutritionConfigured !== false;
  const offlineMessage = demo
    ? "Nutrition search is disabled in demo mode. Sign in to try the live database."
    : "Nutrition search is offline until nutrition API keys or rate limits are configured.";
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannerCapability, setScannerCapability] = useState<{ supported: boolean; reason?: "blocked" | "unsupported" } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorItem, setEditorItem] = useState<FoodItem | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorSource, setEditorSource] = useState<MealEntry["entrySource"]>("search");
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setResults(null);
    if (!q.trim()) {
      setHasSearched(false);
      return;
    }
    if (!nutritionEnabled) {
      setError(offlineMessage);
      setHasSearched(false);
      return;
    }
    if (authLoading) return;
    setHasSearched(true);
    setBusy(true);
    try {
      const response = await nutritionSearch(q.trim());
      setResults(response.results ?? []);
      if (response.status === "upstream_error") {
        const ref = response.debugId ? ` (ref ${response.debugId.slice(0, 8)})` : "";
        setError(`${response.message ?? "Food database temporarily unavailable; please try again later."}${ref}`);
      }
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : undefined;
      let message = typeof err?.message === "string" && err.message !== "Bad Request" ? err.message : null;
      if (!message) {
        if (code === "invalid-argument" || code === "invalid_query") {
          message = "Search query must not be empty.";
        } else if (code === "resource-exhausted") {
          message = "You're searching too quickly. Please slow down.";
        } else if (code === "unavailable" || code === "nutrition_backend_error") {
          message = "Food database temporarily unavailable; please try again later.";
        } else {
          message = "Unable to load nutrition results right now.";
        }
      }
      const debugId = (err as { debugId?: string } | undefined)?.debugId;
      setError(debugId ? `${message} (ref ${debugId.slice(0, 8)})` : message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = cameraAvailable() && isSecureContextOrLocal();
    setScannerCapability({ supported, reason: supported ? undefined : "unsupported" });
  }, []);

  function onDetectedFromScanner(code: string) {
    if (!nutritionEnabled) return;
    setQ(code);
    setTimeout(() => {
      void onSubmit();
    }, 50);
  }

  const liveScannerSupported = scannerCapability?.supported !== false;
  const scannerBlocked = scannerCapability?.reason === "blocked";
  const scannerWarning = nutritionEnabled && !liveScannerSupported
    ? scannerBlocked
      ? "Camera access is blocked for this site. Enable camera permissions or enter the UPC manually."
      : "Live barcode scanning isn't available on this browser. Enter the UPC manually."
    : null;

  function startEdit(item: FoodItem, source: MealEntry["entrySource"]) {
    if (!nutritionEnabled) return;
    if (demo) {
      demoToast();
      return;
    }
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to log meals.", variant: "destructive" });
      return;
    }
    setEditorItem(item);
    setEditorSource(source);
    setEditorOpen(true);
  }

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorItem(null);
    setEditorBusy(false);
    setEditorSource("search");
  };

  async function handleConfirm({ meal }: { meal: MealEntry }) {
    if (!editorItem) return;
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to log meals.", variant: "destructive" });
      closeEditor();
      return;
    }
    setEditorBusy(true);
    try {
      // FIX: prior implementation rendered Add buttons with no handler, so nothing was persisted.
      await addMeal(todayISO, { ...meal, entrySource: editorSource ?? "search" });
      toast({ title: "Meal logged", description: `${editorItem.name} added to today.` });
      onMealLogged?.(editorItem);
      closeEditor();
    } catch (error: any) {
      const description =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : "Unable to log meal. Please try again.";
      toast({ title: "Unable to log meal", description, variant: "destructive" });
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!nutritionEnabled && (
        <Alert variant="destructive">
          <AlertTitle>Nutrition search unavailable</AlertTitle>
          <AlertDescription>{offlineMessage}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          data-testid="nutrition-search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods (e.g., chicken breast, oatmeal or barcode)…"
          className="w-full rounded-md border px-3 py-2 text-sm"
          disabled={authLoading || busy || !nutritionEnabled}
        />
        <button
          data-testid="nutrition-search-button"
          type="submit"
          disabled={!q.trim() || busy || !nutritionEnabled}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {busy ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!nutritionEnabled || !liveScannerSupported) return;
            setScanOpen(true);
          }}
          className="rounded-md border px-3 py-2 text-sm"
          aria-label="Scan barcode"
          disabled={!nutritionEnabled || !liveScannerSupported}
          title={!liveScannerSupported ? scannerWarning ?? undefined : undefined}
        >
          Scan
        </button>
      </form>
      {scannerWarning && (
        <p className="text-[11px] text-muted-foreground">{scannerWarning}</p>
      )}

      {busy && (
        <div className="space-y-2" aria-live="polite">
          <div role="status" className="text-sm text-muted-foreground">
            Searching foods…
          </div>
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-md border p-3">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="mt-2 h-3 w-64 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}

      {hasSearched && results && results.length === 0 && !busy && (
        <div className="text-sm text-muted-foreground">No foods found for “{q}”.</div>
      )}

      {results && results.length > 0 && (
        <ul className="divide-y rounded-md border" data-testid="nutrition-results">
          {results.map((it) => (
            <li key={it.id ?? it.name} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {it.name} {it.brand ? <span className="text-muted-foreground">· {it.brand}</span> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {fmtCal(it.calories)}{sep(it)}{fmtMacros(it)}{sep(it)}{fmtServing(it)}{sep(it)}{it.source || ""}
                </div>
              </div>
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => startEdit(it, "search")}
                disabled={busy || !nutritionEnabled || !user || demo}
                title={!user ? "Sign in to log meals" : undefined}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <BarcodeScannerSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={onDetectedFromScanner}
        onCapabilityChange={(state) => setScannerCapability(state)}
      />

      <Dialog open={editorOpen} onOpenChange={(next) => (next ? setEditorOpen(true) : closeEditor())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editorItem ? `Log ${editorItem.name}` : "Log food"}</DialogTitle>
          </DialogHeader>
          {editorItem && (
            <ServingEditor
              item={editorItem}
              onConfirm={handleConfirm}
              entrySource={editorSource}
              busy={editorBusy}
              readOnly={demo}
              onDemoAttempt={demoToast}
              onCancel={closeEditor}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtCal(kcal?: number | null) {
  return kcal ? `${round(kcal)} kcal` : "kcal ?";
}
function fmtMacros(it: { protein?: number|null; carbs?: number|null; fat?: number|null }) {
  const p = it.protein != null ? `P ${round(it.protein)}g` : "P ?";
  const c = it.carbs   != null ? `C ${round(it.carbs)}g`   : "C ?";
  const f = it.fat     != null ? `F ${round(it.fat)}g`     : "F ?";
  return [p,c,f].join(" • ");
}
function fmtServing(it: { servingSize?: number|null; servingUnit?: string|null }) {
  if (it.servingSize != null && it.servingUnit) return `${round(it.servingSize)} ${it.servingUnit}`;
  if (it.servingSize != null) return `${round(it.servingSize)} g`;
  return "per serving";
}
function sep(it: any) {
  return "  •  ";
}
function round(n?: number | null) {
  if (n == null || !isFinite(n)) return "?";
  return Math.round(n);
}
