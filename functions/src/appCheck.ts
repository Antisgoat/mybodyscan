import { getAppCheck } from "firebase-admin/app-check";

export async function requireAppCheckFromHeader(req: any) {
  const token = req.header("X-Firebase-AppCheck");
  if (!token) throw Object.assign(new Error("missing app check"), { status: 401 });
  try {
    await getAppCheck().verifyToken(token);
  } catch {
    throw Object.assign(new Error("invalid app check"), { status: 401 });
  }
}
