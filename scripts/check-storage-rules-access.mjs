import { GoogleAuth } from "google-auth-library";

// Deployment preflight only: never grant roles from CI. Firebase's noninteractive
// deploy skips this check, which could otherwise publish rules that deny uploads.
try {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { data } = await client.request({
    method: "POST",
    url: "https://cloudresourcemanager.googleapis.com/v1/projects/mybodyscan-f3daf:getIamPolicy",
    data: {},
  });
  const member =
    "serviceAccount:service-157018993008@gcp-sa-firebasestorage.iam.gserviceaccount.com";
  const allowed = data.bindings?.some(
    (binding) =>
      binding.role === "roles/firebaserules.firestoreServiceAgent" &&
      !binding.condition &&
      binding.members?.includes(member)
  );
  if (!allowed) throw new Error("Missing Storage-to-Firestore permission");
  console.log("Storage service-agent Firestore lookup permission verified.");
} catch {
  console.error(
    "Cannot verify Storage-to-Firestore access. Stop deployment and review the Firebase Storage service-agent role with the project owner."
  );
  process.exitCode = 1;
}
