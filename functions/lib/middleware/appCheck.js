import { getAppCheck } from "../firebase.js";
function getHeader(req, key) {
    return req.get(key) ?? req.get(key.toLowerCase()) ?? undefined;
}
export async function requireAppCheckStrict(req, res) {
    const token = getHeader(req, "X-Firebase-AppCheck");
    if (!token) {
        // Soft enforce for now: allow request but log. Tighten later.
        console.warn("appcheck_soft_missing", { path: req.path });
        return;
    }
    try {
        await getAppCheck().verifyToken(token);
    }
    catch (error) {
        // Soft mode: log and continue
        console.warn("appcheck_soft_invalid", { path: req.path, message: error?.message });
        return;
    }
}
export async function softAppCheck(req) {
    const token = getHeader(req, "X-Firebase-AppCheck");
    if (!token) {
        return false;
    }
    try {
        await getAppCheck().verifyToken(token);
        return true;
    }
    catch (error) {
        console.warn("appcheck_soft_invalid", { message: error?.message });
        return false;
    }
}
//# sourceMappingURL=appCheck.js.map