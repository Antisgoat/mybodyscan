import { getFirestore } from "firebase-admin/firestore";
export async function getScanProvider() {
    const snap = await getFirestore().doc("config/app").get();
    const provider = snap.get("scanProvider");
    return provider === "leanlense" ? "leanlense" : "replicate-mvp";
}
