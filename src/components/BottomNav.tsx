import {
  Home as HomeIcon,
  Camera,
  Dumbbell,
  Utensils,
  Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FeatureName, isFeatureEnabled } from "@/lib/featureFlags";
import { isNative } from "@/lib/platform";

const navItems: Array<{
  path: string;
  icon: LucideIcon;
  label: string;
  feature?: FeatureName;
  subscriberOnly?: boolean;
  matchPrefixes?: string[];
}> = [
  { path: "/home", icon: HomeIcon, label: "Home" },
  { path: "/scan", icon: Camera, label: "Scan", feature: "scan" },
  {
    path: "/meals",
    icon: Utensils,
    label: "Meals",
    feature: "nutrition",
    subscriberOnly: true,
  },
  {
    path: "/workouts",
    icon: Dumbbell,
    label: "Train",
    feature: "workouts",
    subscriberOnly: true,
    matchPrefixes: ["/workouts", "/programs"],
  },
  {
    path: "/coach",
    icon: Bot,
    label: "Coach",
    feature: "coach",
    subscriberOnly: true,
  },
];

export function BottomNav() {
  const location = useLocation();
  const native = isNative();
  const filteredNavItems = navItems.filter(
    (item) => (!item.feature || isFeatureEnabled(item.feature)) && (!native || item.path !== "/plans")
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t md:hidden">
      <div className="flex items-center justify-around">
        {filteredNavItems.map(
          ({ path, icon: Icon, label, subscriberOnly, matchPrefixes }) => {
          const isActive =
            location.pathname === path ||
            location.pathname.startsWith(`${path}/`) ||
            Boolean(
              matchPrefixes?.some(
                (prefix) =>
                  location.pathname === prefix ||
                  location.pathname.startsWith(`${prefix}/`)
              )
            );
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
              <span>
                {label}
                {subscriberOnly ? (
                  <span className="ml-1 text-[9px] font-semibold uppercase text-primary">
                    Pro
                  </span>
                ) : null}
              </span>
            </Link>
          );
          }
        )}
      </div>
    </nav>
  );
}
