import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { CrashBanner } from "@/components/CrashBanner";
import { PageSkeleton, CaptureSkeleton } from "@/components/LoadingSkeleton";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthGate from "./components/AuthGate";
import OnboardingRedirectMBS from "./components/OnboardingRedirectMBS";
import AuthedLayout from "./layouts/AuthedLayout";
import { initAuthPersistence } from "./lib/auth";
import { MBS_FLAGS } from "./lib/flags";
import Index from "./pages/Index";
import WelcomeRedirect from "./pages/WelcomeRedirect";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import CapturePicker from "./pages/CapturePicker";
import PhotoCapture from "./pages/PhotoCapture";
import VideoCapture from "./pages/VideoCapture";
import Processing from "./pages/Processing";
import Results from "./pages/Results";
import History from "./pages/History";
import Plans from "./pages/Plans";
import Settings from "./pages/Settings";
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
import ScanNew from "./pages/ScanNew";
import ScanResult from "./pages/ScanResult";
import ScanStart from "./pages/Scan/Start";
import ScanCapture from "./pages/Scan/Capture";
import ScanFlowResult from "./pages/Scan/Result";
import ScanRefine from "./pages/Scan/Refine";
import ScanFlowHistory from "./pages/Scan/History";
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
import Scan from "./pages/Scan";
import Workouts from "./pages/Workouts";
import Meals from "./pages/Meals";
import Coach from "./pages/Coach";
import CoachChat from "./pages/Coach/Chat";
import CoachDay from "./pages/Coach/Day";
import ProgramsCatalog from "./pages/Programs";
import ProgramDetail from "./pages/Programs/Detail";
import ProgramsQuiz from "./pages/Programs/Quiz";
import Nutrition from "./pages/Nutrition";
import { ConsentGate } from "./components/ConsentGate";
import { DemoModeProvider } from "./components/DemoModeProvider";
import MealsSearch from "./pages/MealsSearch";
import BarcodeScan from "./pages/BarcodeScan";
import MealsHistory from "./pages/MealsHistory";
import AdminCredits from "./pages/AdminCredits";
import ScanTips from "./pages/ScanTips";
import WorkoutsLibrary from "./pages/WorkoutsLibrary";
import WorkoutsCompleted from "./pages/WorkoutsCompleted";
import HealthSync from "./pages/HealthSync";
import { RouteBoundary } from "./components/RouteBoundary";
import { FeatureGate } from "./components/FeatureGate";
import DemoGate from "./pages/DemoGate";
import AdminDevTools from "./pages/AdminDevTools";
import CrashTest from "./pages/CrashTest";
import { addPerformanceMark } from "./lib/sentry";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import Ops from "./pages/Ops";
import DebugOverlay from "./routes/__debug";

const loadPublicLayout = () => import("./components/PublicLayout");
const PublicLayout = lazy(loadPublicLayout);
const OnboardingMBS = lazy(() => import("./pages/OnboardingMBS"));
const SystemCheck = lazy(() => import("./pages/SystemCheck"));
const DevAudit = lazy(() => import("./pages/DevAudit"));

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Mark route render start
    addPerformanceMark('route-render-start');
    
    initAuthPersistence().catch(() => {});
    if (MBS_FLAGS.ENABLE_PUBLIC_MARKETING_PAGE) {
      void loadPublicLayout();
    }
    
    // Mark route render complete
    addPerformanceMark('route-render-complete');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppCheckProvider>
          <CrashBanner />
          <Toaster />
          <Sonner />
          <AuthGate>
            <ConsentGate>
              <BrowserRouter>
                <DemoModeProvider>
                  <OnboardingRedirectMBS>
                    <Suspense fallback={<PageSkeleton />}>
                      <AppErrorBoundary>
                        <Routes>
            {/* Root route - flag-controlled */}
            <Route
              path="/"
              element={
                MBS_FLAGS.ENABLE_PUBLIC_MARKETING_PAGE
                  ? <PublicLayout><PublicLanding /></PublicLayout>
                  : <Index />
              }
            />
            <Route path="/__previewframe/*" element={<PreviewFrame />} />
            <Route path="/demo" element={<DemoGate />} />
            {/* Marketing page */}
            <Route path="/welcome" element={<PublicLayout><WelcomeRedirect /></PublicLayout>} />
            {/* Public pages */}
            <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
            <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
            <Route path="/legal/disclaimer" element={<PublicLayout><Disclaimer /></PublicLayout>} />
            <Route path="/support" element={<PublicLayout><Support /></PublicLayout>} />
            <Route path="/help" element={<PublicLayout><Help /></PublicLayout>} />
            <Route path="/legal/privacy" element={<PublicLayout><LegalPrivacy /></PublicLayout>} />
            <Route path="/legal/terms" element={<PublicLayout><LegalTerms /></PublicLayout>} />
            <Route path="/legal/refund" element={<PublicLayout><LegalRefund /></PublicLayout>} />
            {/* Checkout result pages (public) */}
            <Route path="/checkout/success" element={<PublicLayout><CheckoutSuccess /></PublicLayout>} />
            <Route path="/checkout/canceled" element={<PublicLayout><CheckoutCanceled /></PublicLayout>} />
            <Route path="/__debug" element={<DebugOverlay />} />
            {/* Auth */}
            <Route path="/auth" element={
              <Suspense fallback={<PageSkeleton />}>
                <Auth />
              </Suspense>
            } />
            {/* Protected app */}
            <Route path="/home" element={<ProtectedRoute><AuthedLayout><Home /></AuthedLayout></ProtectedRoute>} />
            <Route
              path="/today"
              element={
                <FeatureGate name="health" fallback={<Navigate to="/home" replace />}>
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
                    <Suspense fallback={<LoadingOverlay label="Preparing onboarding…" />}>
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
                    <AuthedLayout>
                      <RouteBoundary>
                        <DataBoundary page="scan">
                          <Scan />
                        </DataBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/coach"
              element={
                <FeatureGate name="coach" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <DataBoundary page="coach">
                            <Coach />
                          </DataBoundary>
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/coach/chat"
              element={
                <FeatureGate name="coach" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <CoachChat />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/coach/day"
              element={
                <FeatureGate name="coach" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <CoachDay />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/programs"
              element={
                <FeatureGate name="coach" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <ProgramsCatalog />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/programs/quiz"
              element={
                <FeatureGate name="coach" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <ProgramsQuiz />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/programs/:id"
              element={
                <FeatureGate name="coach" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <ProgramDetail />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/nutrition"
              element={
                <FeatureGate name="nutrition" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <DataBoundary page="nutrition">
                            <Nutrition />
                          </DataBoundary>
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/workouts"
              element={
                <FeatureGate name="workouts" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <Workouts />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/workouts/library"
              element={
                <FeatureGate name="workouts" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <WorkoutsLibrary />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/workouts/completed"
              element={
                <FeatureGate name="workouts" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <WorkoutsCompleted />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/meals"
              element={
                <FeatureGate name="nutrition" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <Meals />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/meals/search"
              element={
                <FeatureGate name="nutrition" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <MealsSearch />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/barcode"
              element={
                <FeatureGate name="nutrition" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <BarcodeScan />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route path="/meals/barcode" element={<Navigate to="/barcode" replace />} />
            <Route
              path="/meals/history"
              element={
                <FeatureGate name="nutrition" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <AppErrorBoundary>
                          <MealsHistory />
                        </AppErrorBoundary>
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            {/* Capture routes (old + new kept) */}
            <Route path="/capture" element={<ProtectedRoute><AuthedLayout><CapturePicker /></AuthedLayout></ProtectedRoute>} />
            <Route path="/capture/photos" element={
              <ProtectedRoute>
                <AuthedLayout>
                  <Suspense fallback={<CaptureSkeleton />}>
                    <PhotoCapture />
                  </Suspense>
                </AuthedLayout>
              </ProtectedRoute>
            } />
            <Route path="/capture/video" element={
              <ProtectedRoute>
                <AuthedLayout>
                  <Suspense fallback={<CaptureSkeleton />}>
                    <VideoCapture />
                  </Suspense>
                </AuthedLayout>
              </ProtectedRoute>
            } />
            <Route path="/capture-picker" element={<ProtectedRoute><AuthedLayout><CapturePicker /></AuthedLayout></ProtectedRoute>} />
            <Route path="/photo-capture" element={<ProtectedRoute><AuthedLayout><PhotoCapture /></AuthedLayout></ProtectedRoute>} />
            <Route path="/video-capture" element={<ProtectedRoute><AuthedLayout><VideoCapture /></AuthedLayout></ProtectedRoute>} />
            {/* Processing routes (old + new kept) */}
            <Route path="/processing/:uid/:scanId" element={
              <ProtectedRoute>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Processing />
                  </Suspense>
                </AuthedLayout>
              </ProtectedRoute>
            } />
            <Route path="/processing/:scanId" element={
              <ProtectedRoute>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Processing />
                  </Suspense>
                </AuthedLayout>
              </ProtectedRoute>
            } />
            {/* Results */}
            <Route path="/results/:scanId" element={
              <ProtectedRoute>
                <AuthedLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Results />
                  </Suspense>
                </AuthedLayout>
              </ProtectedRoute>
            } />
            {/* Other */}
            <Route
              path="/history"
              element={
                <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <History />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/plans"
              element={
                <FeatureGate name="account" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <Plans />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/settings"
              element={
                <FeatureGate name="account" fallback={<Navigate to="/home" replace />}> 
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
              path="/admin/dev-tools"
              element={
                <ProtectedRoute>
                  <AuthedLayout>
                    <RouteBoundary>
                      <AdminDevTools />
                    </RouteBoundary>
                  </AuthedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ops"
              element={
                <ProtectedRoute>
                  <AuthedLayout>
                    <RouteBoundary>
                      <Ops />
                    </RouteBoundary>
                  </AuthedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/health"
              element={
                <FeatureGate name="health" fallback={<Navigate to="/home" replace />}>
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
            <Route path="/settings/units" element={<ProtectedRoute><AuthedLayout><SettingsUnits /></AuthedLayout></ProtectedRoute>} />
            <Route path="/coach/onboarding" element={<ProtectedRoute><AuthedLayout><CoachOnboarding /></AuthedLayout></ProtectedRoute>} />
            <Route path="/coach/tracker" element={<ProtectedRoute><AuthedLayout><CoachTracker /></AuthedLayout></ProtectedRoute>} />
            <Route path="/settings/health" element={<ProtectedRoute><AuthedLayout><SettingsHealth /></AuthedLayout></ProtectedRoute>} />
            {/* New scan routes */}
            <Route
              path="/scan/start"
              element={
                <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <ScanStart />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/scan/capture"
              element={
                <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <ScanCapture />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/scan/result"
              element={
                <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <ScanFlowResult />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/scan/refine"
              element={
                <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <ScanRefine />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route
              path="/scan/history"
              element={
                <FeatureGate name="scan" fallback={<Navigate to="/home" replace />}>
                  <ProtectedRoute>
                    <AuthedLayout>
                      <RouteBoundary>
                        <ScanFlowHistory />
                      </RouteBoundary>
                    </AuthedLayout>
                  </ProtectedRoute>
                </FeatureGate>
              }
            />
            <Route path="/scan/new" element={<ProtectedRoute><AuthedLayout><ScanNew /></AuthedLayout></ProtectedRoute>} />
            <Route path="/scan/:scanId" element={<ProtectedRoute><AuthedLayout><ScanResult /></AuthedLayout></ProtectedRoute>} />
            <Route path="/scan/tips" element={<ProtectedRoute><AuthedLayout><ScanTips /></AuthedLayout></ProtectedRoute>} />
            {/* Report routes */}
            <Route path="/report" element={<ProtectedRoute><AuthedLayout><Report /></AuthedLayout></ProtectedRoute>} />
            <Route path="/report/:scanId" element={<ProtectedRoute><AuthedLayout><Report /></AuthedLayout></ProtectedRoute>} />
            <Route path="/system/check" element={<SystemCheck />} />
            <Route path="/dev/audit" element={<DevAudit />} />
            <Route path="/debug/credits" element={<DebugCredits />} />
            <Route path="/debug/plan" element={<DebugPlan />} />
            <Route path="/debug/health" element={<DebugHealth />} />
            {/* Test route for error boundary testing */}
            <Route path="/__crash" element={<CrashTest />} />
            {/* MBS Onboarding */}
            <Route
              path="/onboarding-mbs"
              element={
                <Suspense fallback={<PageSkeleton />}>
                  <OnboardingMBS />
                </Suspense>
              }
            />
            {/* Friendly not-found route and wildcard */}
            <Route path="/not-found" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
                        </Routes>
                      </AppErrorBoundary>
                    </Suspense>
                  </OnboardingRedirectMBS>
                </DemoModeProvider>
              </BrowserRouter>
            </ConsentGate>
          </AuthGate>
        </AppCheckProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
