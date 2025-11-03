import { getAuth } from "firebase-admin/auth";

export async function uidFromAuth(req: any): Promise<{ uid: string; email?: string } | null> {
  const h = (req.headers?.authorization || "") as string;
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return null;
  try {
    const dec = await getAuth().verifyIdToken(m[1]);
    return { uid: dec.uid, email: (dec.email || "").toLowerCase() };
  } catch {
    return null;
  }
}

export async function uidFromBearer(req: any): Promise<string | null> {
  const result = await uidFromAuth(req);
  return result?.uid ?? null;
}
