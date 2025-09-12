import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AppConfig = {
  scanProvider: "leanlense" | "replicate-mvp";
  allowFreeScans: boolean;
  defaultTestCredits: number;
  testWhitelist?: string[];
};

let _cache: AppConfig | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  if (_cache) return _cache;
  const snap = await getDoc(doc(db, "config", "app"));
  const data = snap.exists() ? snap.data() : {};
  const cfg: AppConfig = {
    scanProvider: data.scanProvider === "leanlense" ? "leanlense" : "replicate-mvp",
    allowFreeScans: !!data.allowFreeScans,
    defaultTestCredits: Number(data.defaultTestCredits ?? 0) || 0,
    testWhitelist: Array.isArray(data.testWhitelist) ? data.testWhitelist : [],
  };
  _cache = cfg;
  return cfg;
}
