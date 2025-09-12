import { getFirestore } from "firebase-admin/firestore";

export async function getScanProvider(): Promise<"leanlense" | "replicate-mvp"> {
  const snap = await getFirestore().doc("config/app").get();
  const provider = snap.get("scanProvider");
  return provider === "leanlense" ? "leanlense" : "replicate-mvp";
}
