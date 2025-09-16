import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) {
  admin.initializeApp();
}

functions.setGlobalOptions({
  region: "us-central1",
  maxInstances: 20,
  timeoutSeconds: 540,
  memory: "1GiB",
});

const db = admin.firestore();
const storage = admin.storage();

const runtimeConfig = functions.config() as Record<string, any>;

function readConfigValue(key: string): string | undefined {
  const envKey = key.toUpperCase();
  if (process.env[envKey]) {
    return process.env[envKey];
  }
  const lowerKey = key.toLowerCase();
  if (runtimeConfig[lowerKey]) {
    const value = runtimeConfig[lowerKey];
    if (typeof value === "string") return value;
    if (value?.value) return value.value as string;
  }
  const secretsGroup = runtimeConfig.secrets;
  if (secretsGroup && typeof secretsGroup === "object") {
    const direct = secretsGroup[lowerKey] ?? secretsGroup[key] ?? secretsGroup[envKey];
    if (typeof direct === "string") return direct;
  }
  return undefined;
}

export function getSecret(name: string): string | undefined {
  return readConfigValue(name) ?? readConfigValue(name.toLowerCase());
}

export { admin, db, storage, functions };
