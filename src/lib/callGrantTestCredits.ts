import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

export async function grantTestCredits(): Promise<{ total: number; added: number }> {
  const fn = httpsCallable(getFunctions(app, "us-central1"), "grantTestCredits");
  const res = await fn({});
  return (res.data as any) ?? { total: 0, added: 0 };
}
