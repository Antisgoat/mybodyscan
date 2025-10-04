import * as admin from "firebase-admin";
if (!admin.apps.length) {
    admin.initializeApp();
}
/** Throws 401-like error if missing/invalid App Check token */
export async function verifyAppCheckFromHeader(req) {
    const token = req.header("X-Firebase-AppCheck");
    if (!token) {
        console.warn("AppCheck: soft mode (missing)");
        return;
    }
    try {
        await admin.appCheck().verifyToken(token);
    }
    catch (error) {
        console.warn("AppCheck: soft mode (invalid)", { message: error?.message });
        return;
    }
}
//# sourceMappingURL=appCheck.js.map