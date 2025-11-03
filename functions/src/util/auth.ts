import { getAuth } from "firebase-admin/auth";

export async function uidFromBearer(req: { headers?: Record<string, unknown> }): Promise<string | null> {
  const header = (req.headers?.authorization ?? req.headers?.Authorization ?? "") as string;
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) {
    return null;
  }
  const token = match[1]?.trim();
  if (!token) {
    return null;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid ?? null;
  } catch {
    return null;
  }
}
