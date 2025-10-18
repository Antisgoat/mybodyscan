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
import { db } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";

export function AppHeader() {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFounder, setIsFounder] = useState(false);
  const { toast } = useToast();
  const { credits, unlimited, tester } = useCredits();

  useEffect(() => {
    if (!user?.uid) {
      setIsFounder(false);
      return;
    }
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as { meta?: { founder?: boolean } } | undefined;
      setIsFounder(Boolean(data?.meta?.founder));
    });
    return () => unsub();
  }, [user?.uid]);

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

  const isDeveloper = user?.email === "developer@adlrlabs.com" || user?.customClaims?.developer === true;

  const handleRefreshCredits = async () => {
    if (!user) return;
    
    try {
      // Call refreshClaims
      const refreshClaims = httpsCallable(functions, "refreshClaims");
      await refreshClaims({});
      
      // Force refresh the ID token
      await user.getIdToken(true);
      
      // Show success toast with current credits/role
      const creditsText = unlimited ? "∞" : credits.toString();
      const roleText = tester ? " (Tester)" : "";
      
      toast({
        title: "Credits Refreshed",
        description: `Credits: ${creditsText}${roleText}`,
      });
    } catch (error) {
      console.error("Failed to refresh credits:", error);
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh credits. Please try again.",
        variant: "destructive",
      });
    }
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
                {isDeveloper && (
                  <DropdownMenuItem onClick={handleRefreshCredits}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Credits
                  </DropdownMenuItem>
                )}
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
