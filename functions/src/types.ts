import type { Timestamp } from "firebase-admin/firestore";

export type ScanStatus =
  | "awaiting_upload"
  | "queued"
  | "processing"
  | "ready"
  | "done"
  | "failed"
  | "error";

export interface ScanAssets {
  frontUrl?: string;
  leftUrl?: string;
  rightUrl?: string;
  backUrl?: string;
  videoUrl?: string;
}

export interface ScanMeasurements {
  bodyFat?: number;
  bmi?: number;
  weightLb?: number;
  weightKg?: number;
  muscleMassKg?: number;
  visceralFat?: number;
  [metric: string]: number | undefined;
}

export interface ScanDocument {
  uid: string;
  status: ScanStatus;
  creditsDebited?: boolean;
  filesCount?: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
  assets?: ScanAssets;
  measurements?: ScanMeasurements;
  summary?: string | null;
  errorMessage?: string | null;
}

export interface CreditBucket {
  amount: number;
  grantedAt: Timestamp;
  expiresAt?: Timestamp;
  sourcePriceId: string;
  context?: string | null;
}

export interface CreditsSummary {
  totalAvailable: number;
  lastUpdated: Timestamp;
}

export interface CreditsDocument {
  creditBuckets: CreditBucket[];
  creditsSummary: CreditsSummary;
}

export interface LedgerEntry {
  id?: string;
  kind: string;
  creditsDelta: number;
  createdAt: Timestamp;
  notes?: string | null;
}
