import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
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

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === "function") {
    try {
      return (value as any).toDate();
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

function normalize(raw: any, scanId: string): TransformationPreviewDocument {
  const statusRaw = String(raw?.status || "not_started").toLowerCase();
  const status: TransformationPreviewStatus =
    statusRaw === "queued" ||
    statusRaw === "processing" ||
    statusRaw === "ready" ||
    statusRaw === "failed"
      ? (statusRaw as TransformationPreviewStatus)
      : "not_started";

  const goalRaw = String(raw?.goal || "recomp").toLowerCase();
  const goal: TransformationPreviewGoal =
    goalRaw === "lose_fat" ||
    goalRaw === "gain_muscle" ||
    goalRaw === "maintain" ||
    goalRaw === "performance" ||
    goalRaw === "recomp"
      ? (goalRaw as TransformationPreviewGoal)
      : "recomp";

  return {
    scanId,
    status,
    goal,
    timelineWeeks:
      typeof raw?.timelineWeeks === "number" && Number.isFinite(raw.timelineWeeks)
        ? Math.min(52, Math.max(2, Math.round(raw.timelineWeeks)))
        : 12,
    disclaimer:
      typeof raw?.disclaimer === "string" && raw.disclaimer.trim().length
        ? raw.disclaimer.trim()
        : "Transformation Preview is a motivational projection based on your scan and plan. Results vary by adherence, recovery, and consistency.",
    requestedAt: toDateOrNull(raw?.requestedAt),
    updatedAt: toDateOrNull(raw?.updatedAt),
    readyAt: toDateOrNull(raw?.readyAt),
    imageUrl: typeof raw?.imageUrl === "string" ? raw.imageUrl : null,
    compareImageUrl:
      typeof raw?.compareImageUrl === "string" ? raw.compareImageUrl : null,
    promptSummary: typeof raw?.promptSummary === "string" ? raw.promptSummary : null,
    failureReason: typeof raw?.failureReason === "string" ? raw.failureReason : null,
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

export async function requestTransformationPreview(params: {
  uid: string;
  scanId: string;
  goal: TransformationPreviewGoal;
  timelineWeeks: number;
  planSummary?: string | null;
}) {
  const ref = transformationPreviewDoc(params.uid, params.scanId);
  const timelineWeeks = Math.min(52, Math.max(2, Math.round(params.timelineWeeks || 12)));
  await setDoc(
    ref,
    {
      scanId: params.scanId,
      status: "queued",
      goal: params.goal,
      timelineWeeks,
      promptSummary:
        typeof params.planSummary === "string" && params.planSummary.trim().length
          ? params.planSummary.trim().slice(0, 240)
          : null,
      disclaimer:
        "Transformation Preview is a motivational projection based on your scan and plan. Results vary by adherence, recovery, and consistency.",
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
