import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditsBadge } from "@/components/CreditsBadge";
import { SystemHealthIndicator } from "@/components/SystemHealthIndicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthUser, signOutAll } from "@/lib/auth";
import { useNavigate, useLocation } from "react-router-dom";
import { Settings, LogOut, User, RefreshCw } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreSafe, getFunctionsSafe, getAuthSafe } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { toast } from "@/hooks/use-toast";

export function AppHeader() {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFounder, setIsFounder] = useState(false);
  const [claimsRole, setClaimsRole] = useState<string | null>(null);
  const [refreshingClaims, setRefreshingClaims] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!user?.uid) {
        setIsFounder(false);
        return;
      }
      try {
        const db = await getFirestoreSafe();
        if (cancelled) return;
        const ref = doc(db, "users", user.uid);
        unsubscribe = onSnapshot(ref, (snap) => {
          const data = snap.data() as { meta?: { founder?: boolean } } | undefined;
          setIsFounder(Boolean(data?.meta?.founder));
        });
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[header] unable to subscribe to founder meta", err);
        }
        setIsFounder(false);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setClaimsRole(null);
      return () => {
        cancelled = true;
      };
    }
    void user
      .getIdTokenResult()
      .then((token) => {
        if (cancelled) return;
        const roleClaim = typeof token.claims.role === "string" ? token.claims.role : null;
        setClaimsRole(roleClaim);
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[header] unable to fetch claims", err);
        }
        if (!cancelled) setClaimsRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isDev = (claimsRole === "dev") || (user?.email?.toLowerCase() === "developer@adlrlabs.com");

  const handleRefreshClaims = async () => {
    setRefreshingClaims(true);
    try {
      const functions = await getFunctionsSafe();
      await httpsCallable(functions, "refreshClaims")({});
      const auth = await getAuthSafe();
      const current = auth.currentUser;
      if (current) {
        await current.getIdToken(true);
        const next = await current.getIdTokenResult();
        const roleClaim = typeof next.claims.role === "string" ? next.claims.role : null;
        setClaimsRole(roleClaim);
      }
      toast({ title: "Claims refreshed" });
    } catch (error) {
      toast({
        title: "Refresh claims failed",
        description: error instanceof Error ? error.message : String(error ?? "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setRefreshingClaims(false);
    }
  };

  const tabs = [
    { label: "Today", path: "/today" },
    { label: "Plans", path: "/plans" },
    { label: "Workouts", path: "/workouts" },
    { label: "Meals", path: "/meals" },
    { label: "History", path: "/history" }
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOutAll();
    navigate("/auth");
  };

  return (
    <header className="border-b bg-card">
      <div className="max-w-md mx-auto p-4">
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold text-foreground">MyBodyScan</h1>
              <CreditsBadge />
              <SystemHealthIndicator />
              </div>
          
          <div className="flex items-center gap-2">
            {isFounder && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                Founder
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open profile menu"
                  data-testid="profile-menu-trigger"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.photoURL || ""} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {user?.email ? (
                  <>
                    <DropdownMenuLabel data-testid="profile-menu-email">{user.email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {isDev && (
                  <DropdownMenuItem onClick={handleRefreshClaims} disabled={refreshingClaims}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh claims
                  </DropdownMenuItem>
                )}
                {isDev && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Navigation tabs - hidden on mobile, shown on desktop */}
        <div className="hidden md:flex items-center gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.path}
              variant={isActive(tab.path) ? "default" : "ghost"}
              size="sm"
              onClick={() => navigate(tab.path)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}
