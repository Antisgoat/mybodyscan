import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";
import { isWhitelisted } from "@/lib/whitelist";
import { useCredits } from "@/hooks/useCredits";

interface CreditsInfo {
  totalAvailable: number;
  buckets: Array<{
    amount: number;
    grantedAt: { seconds: number; nanoseconds: number };
    expiresAt: { seconds: number; nanoseconds: number } | null;
    sourcePriceId: string | null;
    context: string | null;
  }>;
  lastUpdated: { seconds: number; nanoseconds: number };
  isWhitelisted: boolean;
}

export default function AdminCredits() {
  const { user } = useAuthUser();
  const { credits, unlimited } = useCredits();
  const [creditsInfo, setCreditsInfo] = useState<CreditsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWhitelistedUser = user?.email ? isWhitelisted(user.email) : false;

  useEffect(() => {
    if (!user || !isWhitelistedUser) {
      setCreditsInfo(null);
      return;
    }

    const fetchCreditsInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const getCreditsInfo = httpsCallable(functions, "getCreditsInfo");
        const result = await getCreditsInfo({ uid: user.uid });
        setCreditsInfo(result.data as CreditsInfo);
      } catch (err: any) {
        setError(err.message || "Failed to fetch credits info");
      } finally {
        setLoading(false);
      }
    };

    fetchCreditsInfo();
  }, [user, isWhitelistedUser]);

  const handleGrantCredits = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const grantWhitelistedCredits = httpsCallable(functions, "grantWhitelistedCredits");
      await grantWhitelistedCredits({ 
        uid: user.uid, 
        userEmail: user.email 
      });
      // Refresh credits info
      const getCreditsInfo = httpsCallable(functions, "getCreditsInfo");
      const result = await getCreditsInfo({ uid: user.uid });
      setCreditsInfo(result.data as CreditsInfo);
    } catch (err: any) {
      setError(err.message || "Failed to grant credits");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Seo title="Admin Credits" description="Credits administration" />
        <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">Admin Credits</h1>
            <p className="text-sm text-muted-foreground">Sign in required</p>
          </div>
        </main>
      </div>
    );
  }

  if (!isWhitelistedUser) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <Seo title="Admin Credits" description="Credits administration" />
        <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">Admin Credits</h1>
            <p className="text-sm text-muted-foreground">Access denied - whitelisted users only</p>
          </div>
        </main>
      </div>
    );
  }

  const formatDate = (timestamp: { seconds: number; nanoseconds: number }) => {
    return new Date(timestamp.seconds * 1000).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo title="Admin Credits" description="Credits administration" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Admin Credits</h1>
          <p className="text-sm text-muted-foreground">
            Manage credits for whitelisted users
          </p>
          <div className="flex gap-2">
            <Badge variant="secondary">
              {unlimited ? "∞ (dev)" : `${credits} credits`}
            </Badge>
            {isWhitelistedUser && (
              <Badge variant="outline">Whitelisted</Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current Credits Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}
            {creditsInfo && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-sm font-medium">Total Available:</span>
                    <p className="text-lg font-semibold">{creditsInfo.totalAvailable}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Last Updated:</span>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(creditsInfo.lastUpdated)}
                    </p>
                  </div>
                </div>
                
                {creditsInfo.isWhitelisted && (
                  <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
                    ✓ Whitelisted user - credits don't decrement
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium mb-2">Credit Buckets:</h4>
                  <div className="space-y-2">
                    {creditsInfo.buckets.map((bucket, index) => (
                      <div key={index} className="rounded border p-3 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium">{bucket.amount} credits</span>
                            <p className="text-muted-foreground">
                              {bucket.context || "Unknown source"}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Granted: {formatDate(bucket.grantedAt)}</p>
                            {bucket.expiresAt && (
                              <p>Expires: {formatDate(bucket.expiresAt)}</p>
                            )}
                            {bucket.sourcePriceId && (
                              <p>Price ID: {bucket.sourcePriceId}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              onClick={handleGrantCredits} 
              disabled={loading}
              variant="outline"
            >
              {loading ? "Granting..." : "Grant Whitelisted Credits"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Grants 9,999 non-decrementing credits for whitelisted users
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}