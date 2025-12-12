import * as admin from "firebase-admin";
async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const arg = process.argv[2];
  if (!arg) throw new Error("Provide a UID or email");
  const auth = admin.auth();
  const uid = arg.includes("@") ? (await auth.getUserByEmail(arg)).uid : arg;
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}), staff: true };
  await auth.setCustomUserClaims(uid, claims);
  console.log(`set { staff:true } for uid=${uid}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
