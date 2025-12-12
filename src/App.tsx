import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense, useRef } from "react";
import type { ReactNode } from "react";
import { CrashBanner } from "@/components/CrashBanner";
import { PageSkeleton, CaptureSkeleton } from "@/components/LoadingSkeleton";
import ProtectedRoute from "./components/ProtectedRoute";
import PersonalizationGate from "./components/PersonalizationGate";
import AuthedLayout from "./layouts/AuthedLayout";
import { MBS_FLAGS } from "./lib/flags";
import Index from "./pages/Index";
import WelcomeRedirect from "./pages/WelcomeRedirect";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import CapturePicker from "./pages/CapturePicker";
import PhotoCapture from "./pages/PhotoCapture";
import Processing from "./pages/Processing";
import Results from "./pages/Results";
import HistoryPage from "./pages/History";
import Settings from "./pages/Settings";
import SettingsAccountPrivacyPage from "@/pages/SettingsAccountPrivacy";
import SystemCheckPage from "./pages/SystemCheck";
import SystemCheckPro from "./pages/SystemCheckPro";
import NotFound from "./pages/NotFound";
import { AppCheckProvider } from "./components/AppCheckProvider";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { DataBoundary } from "./components/DataBoundary";
import PublicLanding from "./pages/PublicLanding";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Support from "./pages/Support";
import Disclaimer from "./pages/Disclaimer";
import LegalPrivacy from "./pages/legal/Privacy";
import LegalTerms from "./pages/legal/Terms";
import LegalRefund from "./pages/legal/Refund";
import Help from "./pages/Help";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCanceled from "./pages/CheckoutCanceled";
import OAuthReturn from "./pages/OAuthReturn";
import Login from "./pages/Login";
import AuthCallbackPage from "@/pages/AuthCallback";
import ScanNew from "./pages/ScanNew";
import ScanStart from "./pages/Scan/Start";
import ScanCapture from "./pages/Scan/Capture";
import ScanFlowResult from "./pages/Scan/Result";
import ScanRefine from "./pages/Scan/Refine";
import ScanFlowHistory from "./pages/Scan/History";
import ScanFlowPage from "./pages/ScanFlow";
import Report from "./pages/Report";
import DebugCredits from "./pages/DebugCredits";
import PreviewFrame from "./pages/PreviewFrame";
import CoachOnboarding from "./pages/CoachOnboarding";
import CoachTracker from "./pages/CoachTracker";
import SettingsHealth from "./pages/SettingsHealth";
import SettingsUnits from "./pages/SettingsUnits";
import DebugPlan from "./pages/DebugPlan";
import DebugHealth from "./pages/DebugHealth";
import Today from "./pages/Today";
import Onboarding from "./pages/Onboarding";
import Workouts from "./pages/Workouts";
import CoachChat from "./pages/Coach/Chat";
import CoachDay from "./pages/Coach/Day";
import ProgramsCatalog from "./pages/Programs";
import ProgramDetail from "./pages/Programs/Detail";
import ProgramsQuiz from "./pages/Programs/Quiz";
import PolicyGate from "./components/PolicyGate";
import { DemoModeProvider } from "./components/DemoModeProvider";
import { useDemoWireup } from "./hooks/useDemo";
import MealsSearch from "./pages/MealsSearch";
import BarcodeScan from "./pages/BarcodeScan";
import MealsHistory from "./pages/MealsHistory";
import ScanTips from "./pages/ScanTips";
import WorkoutsLibrary from "./pages/WorkoutsLibrary";
import WorkoutsCompleted from "./pages/WorkoutsCompleted";
import HealthSync from "./pages/HealthSync";
import { RouteBoundary } from "./components/RouteBoundary";
import { FeatureGate } from "./components/FeatureGate";
import DemoGate from "./pages/DemoGate";
import ToastHost from "./components/ToastHost";
import ErrorBoundary from "./components/ErrorBoundary";
import NetBanner from "./components/NetBanner";
import SkipLink from "./components/SkipLink";
import GlobalA11yStyles from "./components/GlobalA11yStyles";
import SetupBanner from "./components/SetupBanner";
import { initBackHandler } from "./lib/back";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { useAuthUser } from "@/lib/auth";
import { refreshClaimsAndAdminBoost } from "@/lib/claims";
import UATPage from "./pages/UAT";
import Billing from "./pages/Billing";
import { disableDemoEverywhere } from "./state/demo";
import { useToast } from "@/hooks/use-toast";

const loadPublicLayout = () => import("./components/PublicLayout");
const PublicLayout = lazy(loadPublicLayout);
const OnboardingMBS = lazy(() => import("./pages/OnboardingMBS"));
const DevAudit = lazy(() => import("./pages/DevAudit"));
const Scan = lazy(() => import("./pages/Scan"));
const Plans = lazy(() => import("./pages/Plans"));
const Coach = lazy(() => import("./pages/Coach"));
const Meals = lazy(() => import("./pages/Meals"));
const ScanResult = lazy(() => import("./pages/ScanResult"));
const ScanComparePage = lazy(() => import("./pages/ScanCompare"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const SmokeKit = lazy(() => import("./pages/SmokeKit"));
const AdminConsole = lazy(() => import("./pages/Admin"));
const AdminQuick = lazy(() => import("./pages/AdminQuick"));

const queryClient = new QueryClient();

const PageSuspense = ({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => <Suspense fallback={fallback ?? <PageSkeleton />}>{children}</Suspense>;

const withPublicLayout = (content: ReactNode, fallback?: ReactNode) => (
  <PageSuspense fallback={fallback}>
    <PublicLayout>{content}</PublicLayout>
  </PageSuspense>
);

const DemoWireup = () => {
  useDemoWireup();
  return null;
};

export const AppProviders = ({ children }: { children: ReactNode }) => {
  useAuthBootstrap();
  const { user } = useAuthUser();
  const { toast } = useToast();
  const claimsErrorCountRef = useRef(0);
  const claimsToastAtRef = useRef(0);

  useEffect(() => {
    if (!user) {
      claimsErrorCountRef.current = 0;
      return;
    }
    disableDemoEverywhere();
    void (async () => {
      try {
        await refreshClaimsAndAdminBoost();
        claimsErrorCountRef.current = 0;
      } catch (error) {
        console.warn("claims_refresh_failed", error);
        claimsErrorCountRef.current += 1;
        const now = Date.now();
        if (
          claimsErrorCountRef.current > 1 &&
          now - claimsToastAtRef.current > 10_000
        ) {
          toast({
            title: "We’re having trouble refreshing your access",
            description:
              "If this continues, sign out and back in or contact support.",
            variant: "destructive",
          });
          claimsToastAtRef.current = now;
        }
      }
    })();
  }, [user, toast]);

  useEffect(() => {
    // Auth persistence is now handled in main.tsx
    if (typeof window !== "undefined") console.log("[init] App mounted");
    if (MBS_FLAGS.ENABLE_PUBLIC_MARKETING_PAGE) {
      void loadPublicLayout();
    }
    initBackHandler();
  }, []);

  return (
    <ErrorBoundary>
      <GlobalA11yStyles />
      <SkipLink />
      <PolicyGate />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppCheckProvider>
            <SetupBanner />
            <CrashBanner />
            <ToastHost />
            <Toaster />
            <Sonner />
            <NetBanner />
            <BrowserRouter>
              <DemoModeProvider>
                <DemoWireup />
                <div id="main-content" role="main">
                  {children}
                </div>
              </DemoModeProvider>
            </BrowserRouter>
          </AppCheckProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

const App = () => (
  <AppProviders>
    <Suspense fallback={null}>
      <Routes>
        {/* Root route - flag-controlled */}
        <Route
          path="/"
          element={
            MBS_FLAGS.ENABLE_PUBLIC_MARKETING_PAGE ? (
              withPublicLayout(<PublicLanding />)
            ) : (
              <Index />
            )
          }
        />
        <Route path="/__previewframe/*" element={<PreviewFrame />} />
        <Route path="/demo" element={<DemoGate />} />
        {/* Marketing page */}
        <Route
          path="/welcome"
          element={withPublicLayout(<WelcomeRedirect />)}
        />
        {/* Public pages */}
        <Route path="/privacy" element={withPublicLayout(<Privacy />)} />
        <Route path="/terms" element={withPublicLayout(<Terms />)} />
        <Route
          path="/legal/disclaimer"
          element={withPublicLayout(<Disclaimer />)}
        />
        <Route path="/support" element={withPublicLayout(<Support />)} />
        <Route path="/help" element={withPublicLayout(<Help />)} />
        <Route
          path="/legal/privacy"
          element={withPublicLayout(<LegalPrivacy />)}
        />
        <Route path="/legal/terms" element={withPublicLayout(<LegalTerms />)} />
        <Route
          path="/legal/refund"
          element={withPublicLayout(<LegalRefund />)}
        />
        <Route
          path="/system-check"
          element={
            <PageSuspense>
              <SystemCheckPage />
            </PageSuspense>
          }
        />
        <Route
          path="/system-check-pro"
          element={
            <PageSuspense>
              <SystemCheckPro />
            </PageSuspense>
          }
        />
        {/* Checkout result pages (public) */}
        <Route
          path="/checkout/success"
          element={withPublicLayout(<CheckoutSuccess />)}
        />
        <Route
          path="/checkout/canceled"
          element={withPublicLayout(<CheckoutCanceled />)}
        />
        {/* Auth */}
        <Route
          path="/auth"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <Auth />
            </Suspense>
          }
        />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/oauth/return" element={<OAuthReturn />} />
        <Route path="/login" element={<Login />} />
        {/* Protected app */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <Home />
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <Billing />
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/today"
          element={
            <FeatureGate
              name="health"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <Today />
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <Suspense
                  fallback={<LoadingOverlay label="Preparing onboarding?" />}
                >
                  <Onboarding />
                </Suspense>
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        {/* New main pages */}
        <Route
          path="/scan"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <DataBoundary page="scan">
                        <PageSuspense>
                          <Scan />
                        </PageSuspense>
                      </DataBoundary>
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/coach"
          element={
            <FeatureGate
              name="coach"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <DataBoundary page="coach">
                        <PageSuspense>
                          <Coach />
                        </PageSuspense>
                      </DataBoundary>
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/coach/chat"
          element={
            <FeatureGate
              name="coach"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <CoachChat />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/coach/day"
          element={
            <FeatureGate
              name="coach"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <CoachDay />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/programs"
          element={
            <FeatureGate
              name="coach"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ProgramsCatalog />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/programs/quiz"
          element={
            <FeatureGate
              name="coach"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ProgramsQuiz />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/programs/:id"
          element={
            <FeatureGate
              name="coach"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ProgramDetail />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/nutrition"
          element={
            <FeatureGate
              name="nutrition"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <DataBoundary page="nutrition">
                        <PageSuspense>
                          <Nutrition />
                        </PageSuspense>
                      </DataBoundary>
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/workouts"
          element={
            <FeatureGate
              name="workouts"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <Workouts />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/workouts/library"
          element={
            <FeatureGate
              name="workouts"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <WorkoutsLibrary />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/workouts/completed"
          element={
            <FeatureGate
              name="workouts"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <WorkoutsCompleted />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/meals"
          element={
            <FeatureGate
              name="nutrition"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <PageSuspense>
                        <Meals />
                      </PageSuspense>
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/meals/search"
          element={
            <FeatureGate
              name="nutrition"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <MealsSearch />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/barcode"
          element={
            <FeatureGate
              name="nutrition"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <BarcodeScan />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/meals/barcode"
          element={<Navigate to="/barcode" replace />}
        />
        <Route
          path="/meals/history"
          element={
            <FeatureGate
              name="nutrition"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <MealsHistory />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        {/* Capture routes (old + new kept) */}
        <Route
          path="/capture"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <CapturePicker />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/capture/photos"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Suspense fallback={<CaptureSkeleton />}>
                    <PhotoCapture />
                  </Suspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/capture-picker"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <CapturePicker />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/photo-capture"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <PhotoCapture />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        {/* Processing routes (old + new kept) */}
        <Route
          path="/processing/:uid/:scanId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Processing />
                  </Suspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/processing/:scanId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Processing />
                  </Suspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scans/:scanId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <ScanResult />
                  </Suspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scans/compare/:leftId/:rightId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <ScanComparePage />
                  </Suspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        {/* Results */}
        <Route
          path="/results/:scanId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Results />
                  </Suspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        {/* Other */}
        <Route
          path="/history"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <HistoryPage />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/plans"
          element={
            <FeatureGate
              name="account"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <PageSuspense>
                      <Plans />
                    </PageSuspense>
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/settings"
          element={
            <FeatureGate
              name="account"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <Settings />
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/settings/account"
          element={
            <FeatureGate
              name="account"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <SettingsAccountPrivacyPage />
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/settings/system-check"
          element={
            <FeatureGate
              name="account"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <SystemCheckPage />
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/settings/system-check-pro"
          element={
            <FeatureGate
              name="account"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <SystemCheckPro />
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/health"
          element={
            <FeatureGate
              name="health"
              fallback={<Navigate to="/home" replace />}
            >
              <ProtectedRoute>
                <AuthedLayout>
                  <RouteBoundary>
                    <HealthSync />
                  </RouteBoundary>
                </AuthedLayout>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/settings/units"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <SettingsUnits />
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/coach/onboarding"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <CoachOnboarding />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/coach/tracker"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <CoachTracker />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/health"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <SettingsHealth />
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        {/* New scan routes */}
        <Route
          path="/scan/start"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ScanStart />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/scan/capture"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ScanCapture />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/scan/flow"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ScanFlowPage />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/scan/result"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ScanFlowResult />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/scan/refine"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ScanRefine />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/scan/history"
          element={
            <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
              <ProtectedRoute>
                <PersonalizationGate>
                  <AuthedLayout>
                    <RouteBoundary>
                      <ScanFlowHistory />
                    </RouteBoundary>
                  </AuthedLayout>
                </PersonalizationGate>
              </ProtectedRoute>
            </FeatureGate>
          }
        />
        <Route
          path="/scan/new"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <ScanNew />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan/:scanId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <PageSuspense>
                    <ScanResult />
                  </PageSuspense>
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan/tips"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <ScanTips />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        {/* Report routes */}
        <Route
          path="/report"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Report />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/report/:scanId"
          element={
            <ProtectedRoute>
              <PersonalizationGate>
                <AuthedLayout>
                  <Report />
                </AuthedLayout>
              </PersonalizationGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dev/audit"
          element={
            <PageSuspense>
              <DevAudit />
            </PageSuspense>
          }
        />
        <Route
          path="/diagnostics"
          element={
            <PageSuspense>
              <Diagnostics />
            </PageSuspense>
          }
        />
        <Route
          path="/__diag"
          element={
            <PageSuspense>
              <Diagnostics />
            </PageSuspense>
          }
        />
        <Route
          path="/__admin"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <AdminConsole />
              </PageSuspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/__admin/quick"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <PageSuspense>
                  <AdminQuick />
                </PageSuspense>
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/__smoke"
          element={
            <ProtectedRoute>
              <AuthedLayout>
                <RouteBoundary>
                  <PageSuspense>
                    <SmokeKit />
                  </PageSuspense>
                </RouteBoundary>
              </AuthedLayout>
            </ProtectedRoute>
          }
        />
        {import.meta.env.DEV && <Route path="/__uat" element={<UATPage />} />}
        <Route path="/debug/credits" element={<DebugCredits />} />
        <Route path="/debug/plan" element={<DebugPlan />} />
        <Route path="/debug/health" element={<DebugHealth />} />
        {/* MBS Onboarding */}
        <Route
          path="/onboarding-mbs"
          element={
            <PageSuspense>
              <OnboardingMBS />
            </PageSuspense>
          }
        />
        {/* Friendly not-found route and wildcard */}
        <Route path="/not-found" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </AppProviders>
);

export default App;
