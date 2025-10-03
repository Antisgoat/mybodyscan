/**
 * Usage:
 *  npx ts-node scripts/setDemoClaim.ts <uid-or-email>
 *
 * Requires admin credentials (GOOGLE_APPLICATION_CREDENTIALS) or Firebase CLI login.
 */
import * as admin from "firebase-admin";

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  const auth = admin.auth();
  const arg = process.argv[2];
  if (!arg) throw new Error("Provide a UID or email");

  let uid = arg;
  if (arg.includes("@")) {
    const user = await auth.getUserByEmail(arg);
    uid = user.uid;
  }
  const user = await auth.getUser(uid);
  const existing = (user.customClaims ?? {}) as Record<string, unknown>;
  const updated = { ...existing, demo: true };
  await auth.setCustomUserClaims(uid, updated);
  console.log(`Set { demo: true } for uid=${uid}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
