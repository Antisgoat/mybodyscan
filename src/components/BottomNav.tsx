import {
  Home as HomeIcon,
  Camera,
  CalendarCheck,
  Dumbbell,
  Utensils,
  Bot,
  History,
  CreditCard,
  Settings,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FeatureName, isFeatureEnabled } from "@/lib/featureFlags";

const navItems: Array<{
  path: string;
  icon: LucideIcon;
  label: string;
  feature?: FeatureName;
}> = [
  { path: "/home", icon: HomeIcon, label: "Home" },
  { path: "/scan", icon: Camera, label: "Scan", feature: "scan" },
  { path: "/meals", icon: Utensils, label: "Meals", feature: "nutrition" },
  { path: "/workouts", icon: Dumbbell, label: "Workouts", feature: "workouts" },
  { path: "/programs", icon: Layers, label: "Plans", feature: "coach" },
  { path: "/coach", icon: Bot, label: "Coach", feature: "coach" },
  { path: "/history", icon: History, label: "History", feature: "scan" },
  { path: "/plans", icon: CreditCard, label: "Billing", feature: "account" },
  { path: "/settings", icon: Settings, label: "Settings", feature: "account" },
];

export function BottomNav() {
  const location = useLocation();
  const filteredNavItems = navItems.filter(
    (item) => !item.feature || isFeatureEnabled(item.feature)
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t md:hidden">
      <div className="flex items-center justify-around">
        {filteredNavItems.map(({ path, icon: Icon, label }) => {
          const isActive =
            location.pathname === path ||
            location.pathname.startsWith(`${path}/`);
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 min-h-[44px] text-xs transition-colors",
                "hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
