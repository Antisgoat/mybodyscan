import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/auth/mbs-auth";
import { toDateOrNull } from "@/lib/time";

export type TodayNutritionTotals = {
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
};

export type LatestScanSummary = {
  createdAt: Date;
  bodyFatPercent?: number;
};

const EMPTY_TOTALS: TodayNutritionTotals = {
  calories: 0,
  proteinGrams: 0,
  carbGrams: 0,
  fatGrams: 0,
};

function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function useCoachTodayAtAGlance() {
  const { user, authReady } = useAuthUser();
  const uid = authReady ? user?.uid ?? null : null;

  const [totals, setTotals] = useState<TodayNutritionTotals>(EMPTY_TOTALS);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionError, setNutritionError] = useState<string | null>(null);

  const [latestScan, setLatestScan] = useState<LatestScanSummary | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const todayKey = useMemo(() => toLocalISODate(new Date()), []);

  useEffect(() => {
    if (!uid) {
      setTotals(EMPTY_TOTALS);
      setNutritionLoading(false);
      setNutritionError(null);
      return;
    }

    setNutritionLoading(true);
    setNutritionError(null);

    const ref = doc(db, "users", uid, "nutritionLogs", todayKey);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as any) : null;
        const t = (data?.totals as any) || {};
        setTotals({
          calories: safeNum(t.calories ?? data?.calories),
          proteinGrams: safeNum(t.protein ?? t.protein_g ?? data?.protein_g),
          carbGrams: safeNum(t.carbs ?? t.carbs_g ?? data?.carbs_g),
          fatGrams: safeNum(t.fat ?? t.fat_g ?? data?.fat_g),
        });
        setNutritionLoading(false);
      },
      (err) => {
        setNutritionLoading(false);
        setNutritionError(err?.code || err?.message || "nutrition_unavailable");
        setTotals(EMPTY_TOTALS);
      }
    );

    return () => unsubscribe();
  }, [uid, todayKey]);

  useEffect(() => {
    if (!uid) {
      setLatestScan(null);
      setScanLoading(false);
      setScanError(null);
      return;
    }

    setScanLoading(true);
    setScanError(null);

    const q = query(
      collection(db, "users", uid, "scans"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setLatestScan(null);
          setScanLoading(false);
          return;
        }
        const docSnap = snapshot.docs[0];
        const data = docSnap.data() as any;
        const createdAt =
          toDateOrNull(data?.createdAt) ?? toDateOrNull(data?.completedAt);
        if (!createdAt) {
          setLatestScan(null);
          setScanLoading(false);
          return;
        }
        const bodyFatPercent = (() => {
          const n =
            // Canonical scan output shape: users/{uid}/scans/{scanId}.estimate.bodyFatPercent
            safeNum(data?.estimate?.bodyFatPercent) ||
            // Backward/legacy fallbacks.
            safeNum(data?.bodyFatPercentage) ||
            safeNum(data?.body_fat) ||
            safeNum(data?.bodyfat);
          return n > 0 ? n : undefined;
        })();
        setLatestScan({ createdAt, bodyFatPercent });
        setScanLoading(false);
      },
      (err) => {
        setScanLoading(false);
        setScanError(err?.code || err?.message || "scan_unavailable");
        setLatestScan(null);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  return {
    uid,
    todayKey,
    totals,
    nutritionLoading,
    nutritionError,
    latestScan,
    scanLoading,
    scanError,
  } as const;
}

