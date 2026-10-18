import { getAuth } from "firebase-admin/auth";

export async function uidFromAuth(
  req: any
): Promise<{
  uid: string;
  email?: string;
  emailVerified: boolean;
  provider?: string;
  claims: Record<string, unknown>;
} | null> {
  const h = (req.headers?.authorization || "") as string;
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return null;
  try {
    const dec = await getAuth().verifyIdToken(m[1]);
    const provider =
      typeof (dec as any)?.firebase?.sign_in_provider === "string"
        ? String((dec as any).firebase.sign_in_provider)
        : undefined;
    return {
      uid: dec.uid,
      email:
        dec.email_verified === true
          ? (dec.email || "").toLowerCase()
          : undefined,
      emailVerified: dec.email_verified === true,
      provider,
      claims: dec as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export async function uidFromBearer(req: any): Promise<string | null> {
  const result = await uidFromAuth(req);
  return result?.uid ?? null;
}
