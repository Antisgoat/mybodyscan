/**
 * Pipeline map — Meals search & logging:
 * - Pulls USDA/OpenFood results through `nutritionSearch` callable, showing AppCheck/system health gating.
 * - Allows barcode scan or manual search, then uses `ServingEditor` to capture servings.
 * - Calls `addMeal` Cloud Function so Firestore `nutritionLogs/{day}` stays authoritative and totals update instantly.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import BarcodeScannerSheet from "@/features/barcode/BarcodeScanner";
import {
  cameraAvailable,
  isSecureContextOrLocal,
} from "@/features/barcode/useZxing";
import { nutritionSearch, type FoodItem } from "@/lib/api/nutrition";
import { useAuthUser } from "@/lib/useAuthUser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useDemoMode } from "@/components/DemoModeProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServingEditor } from "@/components/nutrition/ServingEditor";
import { addMeal, type MealEntry } from "@/lib/nutritionBackend";
import { toast } from "@/hooks/use-toast";
import { demoToast } from "@/lib/demoToast";
import type { FoodItem as RichFoodItem } from "@/lib/nutrition/types";
import { isCapacitorNative } from "@/lib/platform/isNative";

type NutritionSearchProps = {
  onMealLogged?: (item: FoodItem) => void;
  /** Default diary bucket to save into. */
  defaultMealType?: MealEntry["mealType"];
  /** Optional callback with the persisted meal + server totals. */
  onMealAdded?: (payload: { meal: MealEntry; totals: any }) => void;
};

export default function NutritionSearch({
  onMealLogged,
  defaultMealType,
  onMealAdded,
}: NutritionSearchProps = {}) {
  const { loading: authLoading, user } = useAuthUser();
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(
    systemHealth ?? undefined
  );
  const demo = useDemoMode();
  const nutritionEnabled = !demo && nutritionConfigured !== false;
  const offlineMessage = demo
    ? "Nutrition search is disabled in demo mode. Sign in to try the live database."
    : "Backend unavailable right now. Please check your network and try again.";
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannerCapability, setScannerCapability] = useState<{
    supported: boolean;
    reason?: "blocked" | "unsupported";
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorItem, setEditorItem] = useState<RichFoodItem | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorSource, setEditorSource] =
    useState<MealEntry["entrySource"]>("search");
  const editorMealIdRef = useRef<string | null>(null);
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
        const ref = response.debugId
          ? ` (ref ${response.debugId.slice(0, 8)})`
          : "";
        setError(
          `${response.message ?? "Food database temporarily unavailable; please try again later."}${ref}`
        );
      }
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : undefined;
      let message =
        typeof err?.message === "string" && err.message !== "Bad Request"
          ? err.message
          : null;
      if (!message) {
        if (code === "invalid-argument" || code === "invalid_query") {
          message = "Search query must not be empty.";
        } else if (code === "resource-exhausted") {
          message = "You're searching too quickly. Please slow down.";
        } else if (
          code === "unavailable" ||
          code === "nutrition_backend_error"
        ) {
          message =
            "Food database temporarily unavailable; please try again later.";
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
    setScannerCapability({
      supported,
      reason: supported ? undefined : "unsupported",
    });
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
  const scannerWarning =
    nutritionEnabled && !liveScannerSupported
      ? scannerBlocked
        ? isCapacitorNative()
          ? "Camera permission is off. Enable Camera in Settings > Apps > MyBodyScan, or enter the UPC manually."
          : "Camera access is blocked for this site. Enable camera permissions or enter the UPC manually."
        : "Live barcode scanning isn't available on this browser. Enter the UPC manually."
      : null;

  function startEdit(item: FoodItem, source: MealEntry["entrySource"]) {
    if (!nutritionEnabled) return;
    if (demo) {
      demoToast();
      return;
    }
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Sign in to log meals.",
        variant: "destructive",
      });
      return;
    }
    setEditorItem(item);
    setEditorSource(source);
    editorMealIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `meal-${Math.random().toString(36).slice(2, 10)}`;
    setEditorOpen(true);
  }

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorItem(null);
    setEditorBusy(false);
    setEditorSource("search");
    editorMealIdRef.current = null;
  };

  async function handleConfirm({ meal }: { meal: MealEntry }) {
    if (!editorItem) return;
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Sign in to log meals.",
        variant: "destructive",
      });
      closeEditor();
      return;
    }
    setEditorBusy(true);
    try {
      // FIX: prior implementation rendered Add buttons with no handler, so nothing was persisted.
      const result = await addMeal(todayISO, {
        ...meal,
        id: meal.id ?? editorMealIdRef.current ?? undefined,
        mealType: meal.mealType ?? defaultMealType ?? undefined,
        entrySource: editorSource ?? "search",
      });
      toast({
        title: "Meal logged",
        description: `${editorItem.name} added to today.`,
      });
      if (result?.meal && result?.totals) {
        onMealAdded?.({
          meal: result.meal as MealEntry,
          totals: result.totals,
        });
      }
      // `onMealLogged` expects the lightweight search item; forward the raw snapshot if available.
      onMealLogged?.((editorItem.raw ?? editorItem) as any);
      closeEditor();
    } catch (error: any) {
      const description =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : "Unable to log meal. Please try again.";
      toast({
        title: "Unable to log meal",
        description,
        variant: "destructive",
      });
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {!nutritionEnabled && (
        <Alert variant="destructive">
          <AlertTitle>Nutrition search unavailable</AlertTitle>
          <AlertDescription>{offlineMessage}</AlertDescription>
        </Alert>
      )}
      <form
        onSubmit={onSubmit}
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      >
        <input
          data-testid="nutrition-search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods (e.g., chicken breast, oatmeal or barcode)…"
          className="col-span-2 h-11 min-w-0 w-full rounded-lg border bg-background px-3 text-base leading-5 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 sm:col-span-1 sm:text-sm"
          disabled={authLoading || busy || !nutritionEnabled}
        />
        <button
          data-testid="nutrition-search-button"
          type="submit"
          disabled={!q.trim() || busy || !nutritionEnabled}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!nutritionEnabled || !liveScannerSupported) return;
            setScanOpen(true);
          }}
          className="h-11 rounded-lg border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Scan barcode"
          disabled={!nutritionEnabled || !liveScannerSupported}
          title={
            !liveScannerSupported ? (scannerWarning ?? undefined) : undefined
          }
        >
          Scan
        </button>
      </form>
      {scannerWarning && (
        <p className="text-xs leading-5 text-muted-foreground">
          {scannerWarning}
        </p>
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
        <div className="text-sm text-muted-foreground">
          No foods found for “{q}”.
        </div>
      )}

      {results && results.length > 0 && (
        <ul
          className="min-w-0 divide-y overflow-hidden rounded-xl border bg-background"
          data-testid="nutrition-results"
        >
          {results.map((it) => (
            <li
              key={it.id ?? it.name}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3.5 sm:px-4"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="line-clamp-2 break-words text-[15px] font-semibold leading-5 text-foreground">
                  {formatFoodName(it.name)}
                </div>
                {it.brand ? (
                  <div className="line-clamp-1 text-xs leading-4 text-muted-foreground">
                    {formatFoodName(it.brand)}
                  </div>
                ) : null}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4">
                  <span className="font-semibold text-foreground">
                    {fmtCalories(it)}
                  </span>
                  <span className="max-w-full truncate text-muted-foreground">
                    {fmtServing(it)}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {it.source || "Food data"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {macroTokens(it).map((macro) => (
                    <span key={macro.label}>
                      <strong className="font-semibold text-foreground">
                        {macro.label}
                      </strong>{" "}
                      {macro.value}
                    </span>
                  ))}
                </div>
              </div>
              <button
                className="min-h-11 min-w-14 shrink-0 self-center rounded-lg border bg-background px-3 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
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

      <Dialog
        open={editorOpen}
        onOpenChange={(next) => (next ? setEditorOpen(true) : closeEditor())}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editorItem ? `Log ${editorItem.name}` : "Log food"}
            </DialogTitle>
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
  return typeof kcal === "number" && Number.isFinite(kcal)
    ? `${round(kcal)} kcal`
    : "kcal ?";
}
function fmtCalories(it: {
  per_serving: { kcal: number | null };
  per_100g?: { kcal: number | null };
}) {
  if (
    typeof it.per_serving.kcal === "number" &&
    Number.isFinite(it.per_serving.kcal)
  ) {
    return fmtCal(it.per_serving.kcal);
  }
  if (
    typeof it.per_100g?.kcal === "number" &&
    Number.isFinite(it.per_100g.kcal)
  ) {
    return `${fmtCal(it.per_100g.kcal)} per 100 g`;
  }
  return fmtCal(null);
}
function macroTokens(it: {
  per_serving: {
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
}) {
  const p =
    it.per_serving.protein_g != null
      ? `${round(it.per_serving.protein_g)}g`
      : "?";
  const c =
    it.per_serving.carbs_g != null ? `${round(it.per_serving.carbs_g)}g` : "?";
  const f =
    it.per_serving.fat_g != null ? `${round(it.per_serving.fat_g)}g` : "?";
  return [
    { label: "Protein", value: p },
    { label: "Carbs", value: c },
    { label: "Fat", value: f },
  ];
}
function fmtServing(it: {
  serving: { qty: number | null; unit: string | null; text?: string | null };
}) {
  if (it.serving.text) return it.serving.text;
  if (it.serving.qty != null && it.serving.unit)
    return `${round(it.serving.qty)} ${it.serving.unit}`;
  return "per serving";
}
function formatFoodName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned !== cleaned.toUpperCase()) return cleaned || "Food";
  return cleaned
    .toLowerCase()
    .replace(
      /(^|[\s\-/])([a-z])/g,
      (_, boundary: string, letter: string) =>
        `${boundary}${letter.toUpperCase()}`
    );
}
function round(n?: number | null) {
  if (n == null || !isFinite(n)) return "?";
  return Math.round(n);
}
