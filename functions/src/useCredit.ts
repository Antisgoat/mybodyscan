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

  // Check for unlimited credits bypass
  // For whitelisted users with unlimitedCredits claim, skip credit consumption
  // and return success with Infinity remaining credits
  const token = context.auth?.token as any;
  if (token?.unlimitedCredits === true) {
    console.info("useCredit_unlimited_bypass", { uid });
    return { ok: true, remaining: Infinity };
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
