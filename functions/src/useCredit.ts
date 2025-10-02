import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Request } from "express";
import { verifyAppCheckStrict } from "./http.js";
import { consumeCredit } from "./credits.js";

type UseCreditContext = Pick<CallableRequest<unknown>, "auth" | "rawRequest">;

export async function useCreditHandler(
  _data: { reason?: string },
  context: UseCreditContext
) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const rawRequest = context.rawRequest as Request | undefined;
  if (rawRequest) {
    await verifyAppCheckStrict(rawRequest);
  }

  const { consumed, remaining } = await consumeCredit(uid);
  if (!consumed) {
    throw new HttpsError("failed-precondition", "no_credits");
  }

  return { ok: true, remaining };
}

export const useCredit = onCall<{ reason?: string }>(
  { region: "us-central1" },
  async (request: CallableRequest<{ reason?: string }>) =>
    useCreditHandler(request.data, request)
);
