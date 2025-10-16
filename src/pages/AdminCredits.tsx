import { useEffect, useState } from "react";
import { useAuthUser } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useCredits } from "@/hooks/useCredits";

function isWhitelisted(email?: string | null): boolean {
  if (!email) return false;
  return ["developer@adlrlabs.com"].includes(email.toLowerCase());
}

export default function AdminCredits() {
  const { user } = useAuthUser();
  const { credits, unlimited, tester } = useCredits();
  const [lastReason, setLastReason] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);

  const email = user?.email ?? null;
  const allowed = isWhitelisted(email);

  useEffect(() => {
    if (!user?.uid || !allowed) return;
    const ref = doc(db, `users/${user.uid}/private/credits`);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as any;
      const summary = data?.creditsSummary || {};
      setLastReason(typeof summary.lastDeductionReason === "string" ? summary.lastDeductionReason : null);
      const ts = summary.lastDeductionAt?.toDate?.?.() || null;
      setLastAt(ts ? new Date(ts).toLocaleString() : null);
    });
    return () => unsub();
  }, [user?.uid, allowed]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo title="Admin · Credits" />
      <AppHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!allowed ? (
              <p className="text-muted-foreground">Access restricted.</p>
            ) : (
              <>
                <div>
                  <span className="text-muted-foreground">Current:</span> {unlimited ? "∞ (dev)" : credits}
                </div>
                <div>
                  <span className="text-muted-foreground">Tester:</span> {tester ? "yes" : "no"}
                </div>
                <div>
                  <span className="text-muted-foreground">Last deduction reason:</span> {lastReason ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Last deduction at:</span> {lastAt ?? "—"}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
