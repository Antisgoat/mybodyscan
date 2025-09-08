import { Home, Calendar, Dumbbell, Utensils, History } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/today", icon: Home, label: "Today" },
  { path: "/plans", icon: Calendar, label: "Plans" },
  { path: "/workouts", icon: Dumbbell, label: "Workouts" },
  { path: "/meals", icon: Utensils, label: "Meals" },
  { path: "/history", icon: History, label: "History" },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 min-h-[44px] text-xs transition-colors",
                "hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
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