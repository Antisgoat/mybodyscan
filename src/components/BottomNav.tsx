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
    (item) =>
      (!item.feature || isFeatureEnabled(item.feature)) &&
      (!native || item.path !== "/plans")
  );

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:hidden"
      aria-label="Primary mobile navigation"
    >
      <div className="mx-auto flex max-w-xl items-center justify-around px-1">
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
                  "flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs transition-colors",
                  "hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
                )}
              >
                <Icon size={21} strokeWidth={isActive ? 2.25 : 1.9} />
                <span className="truncate">
                  {label}
                  {subscriberOnly ? (
                    <span className="ml-0.5 text-[10px] font-semibold uppercase text-primary">
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
