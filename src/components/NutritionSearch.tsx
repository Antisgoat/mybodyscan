import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lookupBarcode, searchFoods, type FoodItem, type SearchResult } from "@/lib/nutrition";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type Props = {
  className?: string;
};

export default function NutritionSearch(props: Props) {
  const { className } = props;
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<FoodItem[]>([]);
  const inputId = "nutrition-search-input";
  const abortRef = useRef<AbortController | null>(null);
  const debouncedQuery = useDebouncedValue(q, 350);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);

  const isLikelyBarcode = useMemo(() => {
    const v = q.trim();
    return /^\d{8,}$/.test(v); // simple heuristic (UPC/EAN/GTIN)
  }, [q]);

  useEffect(() => {
    setSearchTerm(debouncedQuery.trim());
  }, [debouncedQuery]);

  const runSearch = useCallback(
    (manual = false) => {
      const term = q.trim();
      if (!term) {
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
        setStatus("");
        setItems([]);
        return;
      }
      setSearchTerm(term);
      if (manual) {
        setSearchNonce((value) => value + 1);
      }
    },
    [q],
  );

  useEffect(() => {
    if (!searchTerm) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setStatus("");
      setItems([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const isBarcodeTerm = /^\d{8,}$/.test(searchTerm);
    setLoading(true);
    setStatus(isBarcodeTerm ? "Looking up barcode…" : "Searching…");

    (async () => {
      try {
        const executor = isBarcodeTerm ? lookupBarcode : searchFoods;
        const res: SearchResult = await executor(searchTerm, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setStatus(res.status || "Done.");
        setItems(Array.isArray(res.items) ? res.items : []);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        if ((error as { code?: string } | undefined)?.code === "auth_required") {
          setStatus("Sign in to search.");
          setItems([]);
          return;
        }
        setStatus("Search failed. Please try again.");
        setItems([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [searchTerm, searchNonce]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className={className} style={wrap}>
      <div style={row}>
        <label htmlFor={inputId} style={visuallyHidden}>
          Food search
        </label>
        <input
          id={inputId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(true);
            }
          }}
          placeholder="Search foods (e.g., chicken breast) or paste a barcode…"
          style={input}
        />
        <button type="button" onClick={() => runSearch(true)} disabled={loading || !q.trim()} style={btn}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {isLikelyBarcode && (
        <div style={hint}>Tip: looks like a barcode. Hit Search to look it up.</div>
      )}

      {!!status && (
        <div style={statusStyle} role="status" aria-live="polite">
          {status}
        </div>
      )}

      <div style={list}>
        {items.map((it) => (
          <div key={it.id} style={card}>
            <div style={titleRow}>
              <div style={name}>{it.name}</div>
              <span style={{ ...chip, ...(it.source === "usda" ? chipUsda : chipOff) }}>
                {it.source.toUpperCase()}
              </span>
            </div>
            <div style={subtle}>{it.brand || "—"}</div>
            <div style={macroRow}>
              <span title="Calories">{fmt(it.calories)} kcal</span>
              <span title="Protein">{fmt(it.protein)} g P</span>
              <span title="Fat">{fmt(it.fat)} g F</span>
              <span title="Carbs">{fmt(it.carbs)} g C</span>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && status && status.toLowerCase().includes("no") && (
          <div style={empty}>No results. Try “chicken breast” or a known barcode.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- styles (inline, minimal) ---------- */
const wrap: React.CSSProperties = { display: "grid", gap: 12, maxWidth: 720 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8 };
const input: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 };
const btn: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, background: "white", cursor: "pointer" };
const hint: React.CSSProperties = { fontSize: 12, color: "#666" };
const statusStyle: React.CSSProperties = { fontSize: 12, color: "#333" };
const list: React.CSSProperties = { display: "grid", gap: 8 };
const card: React.CSSProperties = { padding: 12, border: "1px solid #eee", borderRadius: 10, background: "white" };
const titleRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const name: React.CSSProperties = { fontWeight: 600, fontSize: 14 };
const subtle: React.CSSProperties = { fontSize: 12, color: "#666" };
const macroRow: React.CSSProperties = { display: "flex", gap: 12, marginTop: 8, fontSize: 12 };
const chip: React.CSSProperties = { fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid #ddd" };
const chipUsda: React.CSSProperties = { background: "#f0f7ff", borderColor: "#c9e0ff" };
const chipOff: React.CSSProperties = { background: "#f9fff0", borderColor: "#dff0c2" };
const empty: React.CSSProperties = { fontSize: 12, color: "#666" };
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function fmt(v?: number): string {
  return Number.isFinite(v as number) ? String(Math.round(v as number)) : "—";
}
