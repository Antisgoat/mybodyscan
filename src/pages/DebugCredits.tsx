import { useCredits } from "@/hooks/useCredits";

export default function DebugCredits() {
  const { credits, uid, projectId } = useCredits();
  const docPath = uid ? `users/${uid}` : null;

  return (
    <main className="p-6 space-y-2">
      <h1 className="text-lg font-semibold">Credits Debug</h1>
      <div>projectId: {projectId}</div>
      <div>uid: {uid ?? "(none)"}</div>
      <div>doc path: {docPath ?? "users/{uid}"}</div>
      <div>credits: {credits}</div>
      {!uid && <p className="text-sm text-muted-foreground">Log in to watch live credits.</p>}
    </main>
  );
}

