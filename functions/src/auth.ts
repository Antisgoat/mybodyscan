import { getAuth } from "firebase-admin/auth";
import { functions } from "./admin";

export function requireCallableAuth(
  context: functions.https.CallableContext,
  requestId: string
): string {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required"
    );
  }
  if (!context.auth.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Invalid authentication context"
    );
  }
  if (context.app === undefined) {
    functions.logger.warn("callable_without_app_check", { requestId });
  }
  return context.auth.uid;
}

export async function requireUserFromRequest(
  req: functions.https.Request,
  requestId: string
): Promise<string> {
  const authHeader = req.get("authorization") || req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    functions.logger.warn("unauthorized_missing_token", { requestId });
    throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (err) {
    functions.logger.error("unauthorized_invalid_token", { requestId, error: err });
    throw new functions.https.HttpsError("unauthenticated", "Unauthorized");
  }
}
