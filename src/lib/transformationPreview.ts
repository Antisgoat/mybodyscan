import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type TransformationPreviewStatus =
  | "not_started"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type TransformationPreviewGoal =
  | "lose_fat"
  | "gain_muscle"
  | "recomp"
  | "maintain"
  | "performance";

export type TransformationPreviewDocument = {
  scanId: string;
  status: TransformationPreviewStatus;
  goal: TransformationPreviewGoal;
  timelineWeeks: number;
  disclaimer: string;
  requestedAt?: Date | null;
  updatedAt?: Date | null;
  readyAt?: Date | null;
  imageUrl?: string | null;
  compareImageUrl?: string | null;
  promptSummary?: string | null;
  failureReason?: string | null;
};

export function isPaidScanPreviewEligible(scan: unknown): boolean {
  const data =
    scan && typeof scan === "object" ? (scan as Record<string, unknown>) : {};
  return Boolean(
    data.charged === true ||
      data.paid === true ||
      data.creditConsumed === true ||
      data.creditStatus === "consumed" ||
      data.creditStatus === "charged"
  );
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalize(
  raw: unknown,
  scanId: string
): TransformationPreviewDocument {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const statusRaw = String(data.status || "not_started").toLowerCase();
  const status: TransformationPreviewStatus =
    statusRaw === "queued" ||
    statusRaw === "processing" ||
    statusRaw === "ready" ||
    statusRaw === "failed"
      ? (statusRaw as TransformationPreviewStatus)
      : "not_started";

  const goalRaw = String(data.goal || "recomp").toLowerCase();
  const goal: TransformationPreviewGoal =
    goalRaw === "lose_fat" ||
    goalRaw === "gain_muscle" ||
    goalRaw === "maintain" ||
    goalRaw === "performance" ||
    goalRaw === "recomp"
      ? (goalRaw as TransformationPreviewGoal)
      : "recomp";

  const timelineWeeks =
    typeof data.timelineWeeks === "number" &&
    Number.isFinite(data.timelineWeeks)
      ? Math.min(52, Math.max(2, Math.round(data.timelineWeeks)))
      : 12;

  return {
    scanId,
    status,
    goal,
    timelineWeeks,
    disclaimer:
      typeof data.disclaimer === "string" && data.disclaimer.trim().length
        ? data.disclaimer.trim()
        : "Transformation Preview is a motivational wellness visualization. Results vary by adherence, recovery, and consistency.",
    requestedAt: toDateOrNull(data.requestedAt),
    updatedAt: toDateOrNull(data.updatedAt),
    readyAt: toDateOrNull(data.readyAt),
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    compareImageUrl:
      typeof data.compareImageUrl === "string" ? data.compareImageUrl : null,
    promptSummary:
      typeof data.promptSummary === "string" ? data.promptSummary : null,
    failureReason:
      typeof data.failureReason === "string" ? data.failureReason : null,
  };
}

export function transformationPreviewDoc(uid: string, scanId: string) {
  return doc(db, "users", uid, "transformationPreviews", scanId);
}

export function subscribeTransformationPreview(
  uid: string,
  scanId: string,
  onValue: (value: TransformationPreviewDocument | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const ref = transformationPreviewDoc(uid, scanId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onValue(null);
        return;
      }
      onValue(normalize(snap.data(), scanId));
    },
    (error) => {
      onError?.(error as Error);
    }
  );
}
