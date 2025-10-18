import { useEffect, useState } from "react";
import { Button } from "@app/components/ui/button.tsx";
import { CreditsBadge } from "@app/components/CreditsBadge.tsx";
import { SystemHealthIndicator } from "@app/components/SystemHealthIndicator.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@app/components/ui/avatar.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@app/components/ui/dropdown-menu.tsx";
import { useAuthUser, signOutAll } from "@app/lib/auth.ts";
import { useNavigate, useLocation } from "react-router-dom";
import { Settings, LogOut, User } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@app/lib/firebase.ts";

export function AppHeader() {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFounder, setIsFounder] = useState(false);

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
                <Button variant="ghost" size="icon">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.photoURL || ""} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
