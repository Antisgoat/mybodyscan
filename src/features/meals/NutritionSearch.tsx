/**
 * Pipeline map — Meals search & logging:
 * - Pulls USDA/OpenFood results through `nutritionSearch` callable, showing AppCheck/system health gating.
 * - Allows barcode scan or manual search, then uses `ServingEditor` to capture servings.
 * - Calls `addMeal` Cloud Function so Firestore `nutritionLogs/{day}` stays authoritative and totals update instantly.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { localDateKey } from "@/lib/time";
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
import { ArrowLeft, Search, ScanBarcode } from "lucide-react";
import { FoodSearchRow, foodLabel } from "@/components/nutrition/FoodSearchRow";
import {
  useWholeFoodChoices,
  WholeFoodWeightFilter,
} from "@/components/nutrition/WholeFoodChoices";
import { ServingEditor } from "@/components/nutrition/ServingEditor";
import { addMeal, type MealEntry } from "@/lib/nutritionBackend";
import { toast } from "@/hooks/use-toast";
import { demoToast } from "@/lib/demoToast";
import type { FoodItem as RichFoodItem } from "@/lib/nutrition/types";
import { isCapacitorNative } from "@/lib/platform/isNative";

type NutritionSearchProps = {
  /** The diary day currently shown by the parent, not necessarily today. */
  dateISO?: string;
  onMealLogged?: (item: FoodItem) => void;
  /** Default diary bucket to save into. */
  defaultMealType?: MealEntry["mealType"];
  /** Optional callback with the persisted meal + server totals. */
  onMealAdded?: (payload: { meal: MealEntry; totals: any }) => void;
  onSavingChange?: (saving: boolean) => void;
};

const INITIAL_RESULT_COUNT = 8;

export default function NutritionSearch({
  dateISO,
  onMealLogged,
  defaultMealType,
  onMealAdded,
  onSavingChange,
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
  const [visibleResultCount, setVisibleResultCount] =
    useState(INITIAL_RESULT_COUNT);
  const [hasSearched, setHasSearched] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannerCapability, setScannerCapability] = useState<{
    supported: boolean;
    reason?: "blocked" | "unsupported";
  } | null>(null);
  const [editorItem, setEditorItem] = useState<RichFoodItem | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorSource, setEditorSource] =
    useState<MealEntry["entrySource"]>("search");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const editorMealIdRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const { visibleFoods, weightFilter, isWholeFoodList } = useWholeFoodChoices(
    results ?? []
  );
  useEffect(() => {
    onSavingChange?.(editorBusy);
    return () => onSavingChange?.(false);
  }, [editorBusy, onSavingChange]);

  async function onSubmit(e?: FormEvent, query = q) {
    e?.preventDefault();
    const requestId = ++requestIdRef.current;
    setError(null);
    setResults(null);
    setBusy(false);
    setVisibleResultCount(INITIAL_RESULT_COUNT);
    if (!query.trim()) {
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
      const response = await nutritionSearch(query.trim());
      if (requestId !== requestIdRef.current) return;
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
      if (requestId !== requestIdRef.current) return;
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
      if (requestId === requestIdRef.current) setBusy(false);
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
    setScanOpen(false);
    // React state has not committed yet; search the detected code directly.
    void onSubmit(undefined, code);
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
    setSaveError(null);
    setEditorItem(item);
    setEditorSource(source);
    editorMealIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `meal-${Math.random().toString(36).slice(2, 10)}`;
  }

  const closeEditor = () => {
    setSaveError(null);
    setEditorItem(null);
    setEditorBusy(false);
    setEditorSource("search");
    editorMealIdRef.current = null;
  };

  async function handleConfirm({ meal }: { meal: MealEntry }) {
    if (!editorItem || savingRef.current) return;
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Sign in to log meals.",
        variant: "destructive",
      });
      closeEditor();
      return;
    }
    savingRef.current = true;
    setSaveError(null);
    setEditorBusy(true);
    try {
      // FIX: prior implementation rendered Add buttons with no handler, so nothing was persisted.
      const targetDate = dateISO ?? localDateKey(new Date());
      const result = await addMeal(targetDate, {
        ...meal,
        id: meal.id ?? editorMealIdRef.current ?? undefined,
        mealType: meal.mealType ?? defaultMealType ?? undefined,
        entrySource: editorSource ?? "search",
      });
      toast({
        title: "Meal logged",
        description: `${editorItem.name} added to ${targetDate}.`,
      });
      const loggedItem = editorItem;
      closeEditor();
      if (result?.meal && result?.totals) {
        onMealAdded?.({
          meal: result.meal as MealEntry,
          totals: result.totals,
        });
      }
      onMealLogged?.(loggedItem);
    } catch (error: any) {
      const description =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : "Unable to log meal. Please try again.";
      setSaveError(description);
      toast({
        title: "Unable to log meal",
        description,
        variant: "destructive",
      });
    } finally {
      savingRef.current = false;
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
      {editorItem ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={closeEditor}
            disabled={editorBusy}
            className="flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to results
          </button>
          <div>
            <h3 className="text-xl font-semibold leading-tight">
              {foodLabel(editorItem.name)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {editorItem.serving.text || "Choose your portion"}
              {editorItem.brand ? " · " + foodLabel(editorItem.brand) : ""}
            </p>
          </div>
          {saveError && (
            <Alert variant="destructive">
              <AlertTitle>Not saved yet</AlertTitle>
              <AlertDescription>
                {saveError} Your portion is still here. Try saving again.
              </AlertDescription>
            </Alert>
          )}
          <ServingEditor
            item={editorItem}
            onConfirm={handleConfirm}
            entrySource={editorSource}
            busy={editorBusy}
            readOnly={demo}
            onDemoAttempt={demoToast}
          />
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} className="flex min-w-0 gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                data-testid="nutrition-search-input"
                aria-label="Search foods or enter a barcode"
                type="search"
                value={q}
                onChange={(e) => {
                  requestIdRef.current += 1;
                  setQ(e.target.value);
                  setBusy(false);
                  setResults(null);
                  setHasSearched(false);
                  setError(null);
                }}
                placeholder="Food, brand, or barcode"
                className="h-12 w-full min-w-0 rounded-xl border bg-secondary/40 pl-10 pr-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
                disabled={authLoading || !nutritionEnabled}
              />
            </div>
            <button
              data-testid="nutrition-search-button"
              type="submit"
              disabled={!q.trim() || busy || !nutritionEnabled}
              className="h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border hover:bg-secondary disabled:opacity-50"
              aria-label="Scan barcode"
              disabled={
                busy ||
                authLoading ||
                !nutritionEnabled ||
                !liveScannerSupported
              }
              title={
                !liveScannerSupported
                  ? (scannerWarning ?? undefined)
                  : "Scan barcode"
              }
            >
              <ScanBarcode className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
          {scannerWarning && (
            <p className="text-xs leading-5 text-muted-foreground">
              {scannerWarning}
            </p>
          )}
          {busy && (
            <div role="status" className="space-y-3 py-3">
              <p className="text-sm text-muted-foreground">Searching foods…</p>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-secondary/60"
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!hasSearched && !busy && (
            <div className="rounded-2xl bg-secondary/40 px-5 py-7 text-center">
              <p className="font-medium">What did you eat?</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Search a food, check its portion, then add it to your diary.
              </p>
            </div>
          )}
          {hasSearched && results?.length === 0 && !busy && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No foods found for “{q}”. Try a simpler name or scan the barcode.
            </p>
          )}
          {!!results?.length && !busy && (
            <div>
              {weightFilter && <WholeFoodWeightFilter {...weightFilter} />}
              <p className="pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {isWholeFoodList
                  ? "Whole-food basics · choose your cut or lean %"
                  : "Choose a food · adjust the portion next"}
              </p>
              <ul className="min-w-0 divide-y" data-testid="nutrition-results">
                {visibleFoods.slice(0, visibleResultCount).map((it) => (
                  <li key={it.id ?? it.name}>
                    <FoodSearchRow
                      item={it}
                      onSelect={() => startEdit(it, "search")}
                      disabled={!nutritionEnabled || !user || demo}
                    />
                  </li>
                ))}
                {visibleFoods.length > visibleResultCount && (
                  <li className="pt-3">
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-xl border text-sm font-semibold hover:bg-secondary"
                      onClick={() =>
                        setVisibleResultCount((count) =>
                          Math.min(
                            visibleFoods.length,
                            count + INITIAL_RESULT_COUNT
                          )
                        )
                      }
                    >
                      Show{" "}
                      {Math.min(
                        INITIAL_RESULT_COUNT,
                        visibleFoods.length - visibleResultCount
                      )}{" "}
                      more
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
      <BarcodeScannerSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={onDetectedFromScanner}
        onCapabilityChange={setScannerCapability}
      />
    </div>
  );
}
