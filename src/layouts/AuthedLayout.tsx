import { ReactNode, useState } from "react";
import { useNavigate, NavLink, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Menu, User } from "lucide-react";
import { signOutToAuth, useAuthUser } from "@/lib/auth";
import CreditsBadge from "@/components/CreditsBadge";
import { FeatureName, isFeatureEnabled } from "@/lib/featureFlags";
import { useDemoMode } from "@/components/DemoModeProvider";
import { AppFooter } from "@/components/AppFooter";

interface AuthedLayoutProps {
  children: ReactNode;
}

const navItems: Array<{ to: string; label: string; feature?: FeatureName }> = [
  { to: "/home", label: "Home" },
  { to: "/scan", label: "Scan", feature: "scan" },
  { to: "/meals", label: "Meals", feature: "nutrition" },
  { to: "/workouts", label: "Workouts", feature: "workouts" },
  { to: "/programs", label: "Programs", feature: "coach" },
  { to: "/coach", label: "Coach", feature: "coach" },
  { to: "/history", label: "History", feature: "scan" },
  { to: "/plans", label: "Plans", feature: "account" },
  { to: "/settings", label: "Settings", feature: "account" },
];

export default function AuthedLayout({ children }: AuthedLayoutProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const demoMode = useDemoMode();
  const { user } = useAuthUser();
  const readOnlyDemo = demoMode && !user;

  const filteredNavItems = navItems.filter((item) => !item.feature || isFeatureEnabled(item.feature));

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {filteredNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `transition-opacity ${
              isActive
                ? "underline underline-offset-8 decoration-2 font-medium"
                : "opacity-80 hover:opacity-100"
            } ${mobile ? "block py-2" : ""}`
          }
          onClick={() => mobile && setMobileMenuOpen(false)}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 font-semibold"
              onClick={() => navigate("/home")}
            >
              <img src="/logo.svg" alt="MyBodyScan" className="w-6 h-6" />
              MyBodyScan
            </button>
            {readOnlyDemo ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Demo
              </span>
            ) : null}
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm" data-testid="app-nav">
            <NavLinks />
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Credits Pill */}
            <CreditsBadge />

            {/* Desktop Avatar Menu */}
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOutToAuth}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile Menu */}
            <div className="md:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <div className="flex flex-col gap-4 mt-8">
                    <nav className="flex flex-col gap-2 text-sm">
                      <NavLinks mobile />
                    </nav>
                    <hr className="border-t" />
                    <div className="flex flex-col gap-2 text-sm">
                      <button
                        className="text-left py-2 opacity-80 hover:opacity-100 transition-opacity"
                        onClick={() => {
                          navigate("/settings");
                          setMobileMenuOpen(false);
                        }}
                      >
                        Settings
                      </button>
                      <button
                        className="text-left py-2 opacity-80 hover:opacity-100 transition-opacity"
                        onClick={() => {
                          signOutToAuth();
                          setMobileMenuOpen(false);
                        }}
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
        {readOnlyDemo ? (
          <div className="border-t bg-amber-50 text-amber-900 text-xs">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>Demo preview — read-only experience.</span>
              <div className="flex items-center gap-3">
                {readOnlyDemo ? (
                  <Link to="/plans" className="underline-offset-4 hover:underline font-medium">
                    Sign up to save progress
                  </Link>
                ) : null}
                <Link to="/system/check" className="underline-offset-4 hover:underline">
                  Diagnostics
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</div>
      </main>
      <AppFooter />
    </div>
  );
}
