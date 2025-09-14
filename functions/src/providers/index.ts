import { getFirestore } from "firebase-admin/firestore";
import type { ScanProvider } from "./scanProvider.js";
import { PlaceholderProvider } from "./placeholderProvider.js";
import { OpenAIProvider } from "./openaiProvider.js";
import { ReplicateProvider } from "./replicateProvider.js";

export async function getScanProvider(): Promise<ScanProvider> {
  const snap = await getFirestore().doc("config/app").get();
  const provider = snap.get("scanProvider");
  if (provider === "openai") {
    return new OpenAIProvider();
  }
  if (provider === "placeholder") {
    return new PlaceholderProvider();
  }
  return new ReplicateProvider();
}
