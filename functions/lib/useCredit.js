import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifyAppCheckStrict } from "./http.js";
import { consumeCredit } from "./credits.js";
export async function useCreditHandler(_data, context) {
    const uid = context.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
    }
    const rawRequest = context.rawRequest;
    if (rawRequest) {
        await verifyAppCheckStrict(rawRequest);
    }
    const { consumed, remaining } = await consumeCredit(uid);
    if (!consumed) {
        throw new HttpsError("failed-precondition", "no_credits");
    }
    return { ok: true, remaining };
}
export const useCredit = onCall({ region: "us-central1" }, async (request) => useCreditHandler(request.data, request));
//# sourceMappingURL=useCredit.js.map