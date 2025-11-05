import { firebaseReady } from "@/lib/firebase";
import { call } from "@/lib/callable";

export type ExportImage = { name: string; url: string; expiresAt: string };

export type ExportIndex = {
  ok: boolean;
  expiresAt: string;
  profile: Record<string, unknown> | null;
  scans: Array<{
    id: string;
    status: string;
    createdAt: number | null;
    completedAt: number | null;
    result: unknown;
    metadata: { images: ExportImage[] };
  }>;
};

export async function requestAccountDeletion(): Promise<void> {
  await firebaseReady();
  const result = await call("deleteMyAccount", {});
  const data = result.data as { ok?: boolean };
  if (!data?.ok) {
    throw new Error("delete_failed");
  }
}

export async function requestExportIndex(): Promise<ExportIndex> {
  await firebaseReady();
  const result = await call("exportMyData", {});
  const data = result.data as ExportIndex;
  if (!data?.ok) {
    throw new Error("export_failed");
  }
  return data;
}
