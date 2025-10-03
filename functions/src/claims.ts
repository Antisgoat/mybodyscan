import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  const user = await admin.auth().getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}
