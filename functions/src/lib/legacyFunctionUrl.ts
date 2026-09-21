/** Internal gateway target for the small set of explicitly registered legacy
 * functions. Never derive this from the request Host header: on Hosting that
 * would route back to the SPA and a 200 HTML page could be mistaken for a
 * successful write. */
export function legacyFunctionUrl(
  functionName: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const project =
    env.GCLOUD_PROJECT?.trim() ||
    env.GCP_PROJECT?.trim() ||
    (() => {
      try {
        return (JSON.parse(env.FIREBASE_CONFIG || "{}") as { projectId?: string }).projectId?.trim();
      } catch {
        return undefined;
      }
    })();
  const region = env.FUNCTION_REGION?.trim() || "us-central1";
  if (!project || !/^[a-z][a-z0-9-]{4,62}$/.test(project)) return null;
  if (!/^[a-z0-9-]+$/.test(region)) return null;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(functionName)) return null;
  return `https://${region}-${project}.cloudfunctions.net/${functionName}`;
}
