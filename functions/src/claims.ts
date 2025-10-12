import * as admin from "firebase-admin";

function ensureAdmin() {
  if (!admin.apps || !admin.apps.length) {
    admin.initializeApp();
  }
  return admin;
}

export async function isStaff(uid?: string): Promise<boolean> {
  if (!uid) return false;
  const auth = ensureAdmin().auth();
  const user = await auth.getUser(uid);
  return Boolean((user.customClaims as any)?.staff === true);
}
