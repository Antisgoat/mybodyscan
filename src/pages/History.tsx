import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  listenLatest,
  loadMore,
  type ScanItem,
} from "@/features/history/useScansPage";
import { extractScanMetrics } from "@/lib/scans";
import { getFrontThumbUrl } from "@/lib/scanMedia";
import { deleteScanApi } from "@/lib/api/scan";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/lib/useAuthUser";
import { scanStatusLabel } from "@/lib/scanStatus";
import { useUnits } from "@/hooks/useUnits";
import { summarizeScanMetrics } from "@/lib/scanDisplay";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoScanHistory } from "@/lib/demoDataset";
import { toDateOrNull } from "@/lib/time";

export default function HistoryPage() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { user, authReady } = useAuthUser();
  const { units } = useUnits();
  const demo = useDemoMode();
  const uid = authReady ? (user?.uid ?? null) : null;
  const [items, setItems] = useState<ScanItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo && !user) {
      setItems(demoScanHistory as unknown as ScanItem[]);
      setThumbs({});
      setError(null);
      return;
    }
    if (!uid) {
      setItems([]);
      setThumbs({});
      setError(null);
      return;
    }
    try {
      const unsub = listenLatest(uid, setItems);
      setError(null);
      return () => unsub();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load scans.";
      setError(message);
      return undefined;
    }
  }, [uid, demo, user]);

  useEffect(() => {
    // Lazy-fetch thumbnails for newly visible items
    if (demo && !user) return;
    items.forEach((it) => {
      if (thumbs[it.id] === undefined) {
        getFrontThumbUrl(it.id).then((url) =>
          setThumbs((t) => ({ ...t, [it.id]: url }))
        );
      }
    });
  }, [items, demo, user]); // eslint-disable-line

  function toggle(id: string) {
    setSelected((sel) => {
      if (sel.includes(id)) return sel.filter((x) => x !== id);
      if (sel.length >= 2) return [sel[1], id]; // keep at most 2
      return [...sel, id];
    });
  }

  async function onDelete(id: string) {
    if (demo && !user) {
      toast({
        title: "Demo is read-only",
        description: "Sign up to save and manage your scans.",
      });
      return;
    }
    if (!uid) {
      toast({
        title: "Sign in required",
        description: "Sign in to manage your scans.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm("Delete this scan? This cannot be undone.")) return;
    setBusyDelete(id);
    try {
      await deleteScanApi(id);
      setItems((cur) => cur.filter((scan) => scan.id !== id));
      setSelected((cur) => cur.filter((scanId) => scanId !== id));
      setThumbs((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      toast({
        title: "Scan deleted",
        description: "This scan has been removed from your history.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to delete scan. Please try again.";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusyDelete(null);
    }
  }

  const lastId = items.at(-1)?.id;
  async function onLoadMore() {
    if (demo && !user) return;
    if (!lastId || !uid) return;
    setLoadingMore(true);
    try {
      const next = await loadMore(uid, lastId);
      setItems((cur) => [...cur, ...next]);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold">History</h1>
      {authReady && !uid && !(demo && !user) && (
        <Alert className="mt-3 border-amber-200 bg-amber-50 text-amber-900">
          <AlertTitle>Sign in to view scans</AlertTitle>
          <AlertDescription>
            Log in to review your scan history, delete results, or compare
            progress.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert className="mt-3 border-destructive/30 text-destructive">
          <AlertTitle>Unable to load scans</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground mt-2">No scans yet.</p>
      )}
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it) => {
          const metrics = extractScanMetrics(it as any);
          const summary = summarizeScanMetrics(metrics, units);
          const sel = selected.includes(it.id);
          const statusMeta = scanStatusLabel(
            it.status as string | undefined,
            (it as any)?.updatedAt ?? (it as any)?.completedAt ?? it.createdAt
          );
          return (
            <li
              key={it.id}
              className={`rounded border overflow-hidden ${sel ? "ring-2 ring-emerald-400" : ""}`}
            >
              <button
                className="block w-full text-left"
                onClick={() => toggle(it.id)}
              >
                <div className="aspect-[3/4] bg-black/5 overflow-hidden">
                  {thumbs[it.id] ? (
                    <img
                      src={thumbs[it.id]!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse" />
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">
                      {(toDateOrNull(it.createdAt) ?? new Date()).toLocaleString()}
                    </span>
                    <span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          statusMeta.badgeVariant === "destructive"
                            ? "bg-red-50 text-red-700"
                            : statusMeta.badgeVariant === "default"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {statusMeta.label}
                      </span>
                    </span>
                  </div>
                  {statusMeta.showMetrics ? (
                    <div className="text-sm font-medium">
                      {summary.bodyFatText !== "—" ? `${summary.bodyFatText} BF` : "—"} ·{" "}
                      {summary.weightText}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {statusMeta.helperText}
                    </p>
                  )}
                </div>
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => nav(`/scans/${it.id}`)}
                    className="text-[11px] underline"
                  >
                    Open
                  </button>
                  {statusMeta.recommendRescan && (
                    <button
                      onClick={() => nav("/scan")}
                      className="text-[11px] underline text-primary"
                    >
                      Rescan
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onDelete(it.id)}
                  className="text-[11px] text-red-700 underline"
                  disabled={busyDelete === it.id}
                >
                  {busyDelete === it.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {lastId && !(demo && !user) && (
        <div className="mt-3">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded border px-3 py-2 text-sm w-full"
          >
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
