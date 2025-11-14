import { useEffect, useState } from "react";
import { listenLatest, loadMore, type ScanItem } from "@/features/history/useScansPage";
import { normalizeScanMetrics } from "@/lib/scans";
import { getFrontThumbUrl } from "@/lib/scanMedia";
import { useNavigate } from "react-router-dom";
import { deleteScanApi } from "@/lib/api/scan";

export default function HistoryPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<ScanItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const unsub = listenLatest(setItems);
    return () => unsub();
  }, []);

  useEffect(() => {
    // Lazy-fetch thumbnails for newly visible items
    items.forEach((it) => {
      if (thumbs[it.id] === undefined) {
        getFrontThumbUrl(it.id).then((url) => setThumbs((t) => ({ ...t, [it.id]: url })));
      }
    });
  }, [items]); // eslint-disable-line

  function toggle(id: string) {
    setSelected((sel) => {
      if (sel.includes(id)) return sel.filter((x) => x !== id);
      if (sel.length >= 2) return [sel[1], id]; // keep at most 2
      return [...sel, id];
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this scan? This cannot be undone.")) return;
    setBusyDelete(id);
    try { await deleteScanApi(id); } finally { setBusyDelete(null); }
  }

  const lastId = items.at(-1)?.id;
  async function onLoadMore() {
    if (!lastId) return;
    setLoadingMore(true);
    try {
      const next = await loadMore(lastId);
      setItems((cur) => [...cur, ...next]);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold">History</h1>
      {items.length === 0 && <p className="text-sm text-muted-foreground mt-2">No scans yet.</p>}
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it) => {
          const m = normalizeScanMetrics(it as any);
          const sel = selected.includes(it.id);
          return (
            <li key={it.id} className={`rounded border overflow-hidden ${sel ? "ring-2 ring-emerald-400" : ""}`}>
              <button className="block w-full text-left" onClick={() => toggle(it.id)}>
                <div className="aspect-[3/4] bg-black/5 overflow-hidden">
                  {thumbs[it.id] ? (
                    <img src={thumbs[it.id]!} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full animate-pulse" />
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs text-muted-foreground truncate">
                    {new Date(it.createdAt?.toMillis?.() ?? Date.now()).toLocaleString()}
                  </div>
                  <div className="text-sm font-medium">
                    {m.bodyFatPct != null ? `${m.bodyFatPct}% BF` : "—"} · {m.weightLb != null ? `${m.weightLb} lb` : "—"}
                  </div>
                </div>
              </button>
              <div className="flex items-center justify-between px-2 pb-2">
                <button onClick={() => nav(`/scans/${it.id}`)} className="text-[11px] underline">Open</button>
                <button onClick={() => onDelete(it.id)} className="text-[11px] text-red-700 underline" disabled={busyDelete === it.id}>
                  {busyDelete === it.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {lastId && (
        <div className="mt-3">
          <button onClick={onLoadMore} disabled={loadingMore} className="rounded border px-3 py-2 text-sm w-full">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Sticky compare bar */}
      <div className="fixed inset-x-0 bottom-3 flex justify-center">
        <button
          disabled={selected.length !== 2}
          onClick={() => nav(`/scans/compare/${selected[0]}/${selected[1]}`)}
          className="rounded-full border bg-white px-4 py-2 text-sm shadow disabled:opacity-50"
        >
          Compare ({selected.length}/2)
        </button>
      </div>
    </div>
  );
}
