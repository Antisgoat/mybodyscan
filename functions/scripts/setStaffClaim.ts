/**
 * Usage:
 *  npx ts-node scripts/setStaffClaim.ts developer@adlrlabs.com
 */
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Provide UID or email");
  const auth = admin.auth();
  const uid = arg.includes("@") ? (await auth.getUserByEmail(arg)).uid : arg;
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}), staff: true };
  await auth.setCustomUserClaims(uid, claims);
  console.log(`✅ set { staff:true } for uid=${uid}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
