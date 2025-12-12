import { FieldValue, Timestamp, getFirestore } from "../firebase.js";

const db = getFirestore();

export interface OperationResult {
  alreadyCompleted: boolean;
  data?: FirebaseFirestore.DocumentData | null;
}

export interface OperationMetadata {
  type: string;
  amount?: number;
  source?: string;
  [key: string]: unknown;
}

export async function runUserOperation(
  uid: string,
  opId: string,
  metadata: OperationMetadata,
  runner: () => Promise<void>
): Promise<OperationResult> {
  const safeOpId = opId.trim();
  if (!safeOpId) {
    throw new Error("operation_id_required");
  }
  const ref = db.doc(
    `users/${uid}/private/ops/${safeOpId}`
  ) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

  const txResult = await db.runTransaction(
    async (tx: FirebaseFirestore.Transaction) => {
      const snap = (await tx.get(
        ref
      )) as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
      if (snap.exists) {
        const data = snap.data();
        const status = typeof data?.status === "string" ? data.status : "";
        if (status === "error") {
          // Allow retry by clearing the failed document
          tx.delete(ref);
          return { status: "retry" as const, data: data ?? null };
        }
        return { status: "existing" as const, data: data ?? null };
      }

      tx.create(ref, {
        status: "pending",
        createdAt: Timestamp.now(),
        ...metadata,
      });
      return { status: "created" as const };
    }
  );

  if (txResult.status === "existing") {
    return { alreadyCompleted: true, data: txResult.data ?? null };
  }

  if (txResult.status === "retry") {
    // Re-run recursively after clearing failed state
    return await runUserOperation(uid, safeOpId, metadata, runner);
  }

  try {
    await runner();
    await ref.set(
      {
        status: "complete",
        completedAt: Timestamp.now(),
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { alreadyCompleted: false };
  } catch (error) {
    const message = (error as Error)?.message || String(error);
    await ref.set(
      {
        status: "error",
        error: message,
        failedAt: Timestamp.now(),
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await ref.delete().catch(() => undefined);
    throw error;
  }
}

export function buildAdminOperationId(prefix: string, source: string): string {
  const normalized = source.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
  return `${prefix}-${normalized}`;
}
