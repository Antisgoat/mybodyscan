import { httpsCallable } from "firebase/functions";

import { firebaseReady, getFirebaseFunctions } from "@/lib/firebase";

export type ExportIndex = {
  ok: boolean;
  expiresAt: string;
  scans: Array<{
    id: string;
    status: string;
    createdAt: number | null;
    completedAt: number | null;
    result: unknown;
    metadata: { images: Array<{ pose: string; url: string }> };
  }>;
};

export async function requestAccountDeletion(): Promise<void> {
  await firebaseReady();
  const callable = httpsCallable(getFirebaseFunctions(), "deleteMyAccount");
  const result = await callable({});
  const data = result.data as { ok?: boolean };
  if (!data?.ok) {
    throw new Error("delete_failed");
  }
}

export async function requestExportIndex(): Promise<ExportIndex> {
  await firebaseReady();
  const callable = httpsCallable(getFirebaseFunctions(), "createExportIndex");
  const result = await callable({});
  const data = result.data as ExportIndex;
  if (!data?.ok) {
    throw new Error("export_failed");
  }
  return data;
}
