import { useState, type FormEvent } from "react";
import BarcodeScannerSheet from "@/features/barcode/BarcodeScanner";
import { nutritionSearch, type FoodItem } from "@/lib/api/nutrition";
import { useAuthUser } from "@/lib/useAuthUser";

export default function NutritionSearch() {
  const { loading: authLoading } = useAuthUser();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setResults(null);
    if (!q.trim()) {
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

  function onDetectedFromScanner(code: string) {
    setQ(code);
    setTimeout(() => {
      void onSubmit();
    }, 50);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          data-testid="nutrition-search-input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods (e.g., chicken breast, oatmeal or barcode)…"
          className="w-full rounded-md border px-3 py-2 text-sm"
          disabled={authLoading || busy}
        />
        <button
          data-testid="nutrition-search-button"
          type="submit"
          disabled={!q.trim() || busy}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {busy ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="rounded-md border px-3 py-2 text-sm"
          aria-label="Scan barcode"
        >
          Scan
        </button>
      </form>

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
              {/* Hook up "Add" to diary in a later prompt */}
              <button className="rounded border px-2 py-1 text-xs">Add</button>
            </li>
          ))}
        </ul>
      )}

      <BarcodeScannerSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={onDetectedFromScanner}
      />
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
