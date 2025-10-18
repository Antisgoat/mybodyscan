import { Toaster } from "@app/components/ui/toaster.tsx";
import { Toaster as Sonner } from "@app/components/ui/sonner.tsx";
import { TooltipProvider } from "@app/components/ui/tooltip.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { CrashBanner } from "@app/components/CrashBanner.tsx";
import { PageSkeleton, CaptureSkeleton } from "@app/components/LoadingSkeleton.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import AuthGate from "./components/AuthGate.tsx";
import OnboardingRedirectMBS from "./components/OnboardingRedirectMBS.tsx";
import AuthedLayout from "./layouts/AuthedLayout.tsx";
import { initAuthPersistence } from "./lib/auth.ts";
import { MBS_FLAGS } from "./lib/flags.ts";
import Index from "./pages/Index.tsx";
import WelcomeRedirect from "./pages/WelcomeRedirect.tsx";
import Auth from "./pages/Auth.tsx";
import Home from "./pages/Home.tsx";
import CapturePicker from "./pages/CapturePicker.tsx";
import PhotoCapture from "./pages/PhotoCapture.tsx";
import VideoCapture from "./pages/VideoCapture.tsx";
import Processing from "./pages/Processing.tsx";
import Results from "./pages/Results.tsx";
import History from "./pages/History.tsx";
import Plans from "./pages/Plans.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AppCheckProvider } from "./components/AppCheckProvider.tsx";
import { LoadingOverlay } from "./components/LoadingOverlay.tsx";
import { DataBoundary } from "./components/DataBoundary.tsx";
import PublicLanding from "./pages/PublicLanding.tsx";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import Support from "./pages/Support.tsx";
import Disclaimer from "./pages/Disclaimer.tsx";
import LegalPrivacy from "./pages/legal/Privacy.tsx";
import LegalTerms from "./pages/legal/Terms.tsx";
import LegalRefund from "./pages/legal/Refund.tsx";
import Help from "./pages/Help.tsx";
import CheckoutSuccess from "./pages/CheckoutSuccess.tsx";
import CheckoutCanceled from "./pages/CheckoutCanceled.tsx";
import ScanNew from "./pages/ScanNew.tsx";
import ScanResult from "./pages/ScanResult.tsx";
import ScanStart from "./pages/Scan/Start.tsx";
import ScanCapture from "./pages/Scan/Capture.tsx";
import ScanFlowResult from "./pages/Scan/Result.tsx";
import ScanRefine from "./pages/Scan/Refine.tsx";
import ScanFlowHistory from "./pages/Scan/History.tsx";
import Report from "./pages/Report.tsx";
import DebugCredits from "./pages/DebugCredits.tsx";
import PreviewFrame from "./pages/PreviewFrame.tsx";
import CoachOnboarding from "./pages/CoachOnboarding.tsx";
import CoachTracker from "./pages/CoachTracker.tsx";
import SettingsHealth from "./pages/SettingsHealth.tsx";
import SettingsUnits from "./pages/SettingsUnits.tsx";
import DebugPlan from "./pages/DebugPlan.tsx";
import DebugHealth from "./pages/DebugHealth.tsx";
import Today from "./pages/Today.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Scan from "./pages/Scan.tsx";
import Workouts from "./pages/Workouts.tsx";
import Meals from "./pages/Meals.tsx";
import Coach from "./pages/Coach/index.tsx";
import CoachChat from "./pages/Coach/Chat.tsx";
import CoachDay from "./pages/Coach/Day.tsx";
import ProgramsCatalog from "./pages/Programs/index.tsx";
import ProgramDetail from "./pages/Programs/Detail.tsx";
import ProgramsQuiz from "./pages/Programs/Quiz.tsx";
import Nutrition from "./pages/Nutrition.tsx";
import { ConsentGate } from "./components/ConsentGate.tsx";
import { DemoModeProvider } from "./components/DemoModeProvider.tsx";
import MealsSearch from "./pages/MealsSearch.tsx";
import BarcodeScan from "./pages/BarcodeScan.tsx";
import MealsHistory from "./pages/MealsHistory.tsx";
import AdminCredits from "./pages/AdminCredits.tsx";
import ScanTips from "./pages/ScanTips.tsx";
import WorkoutsLibrary from "./pages/WorkoutsLibrary.tsx";
import WorkoutsCompleted from "./pages/WorkoutsCompleted.tsx";
import HealthSync from "./pages/HealthSync.tsx";
import { RouteBoundary } from "./components/RouteBoundary.tsx";
import { FeatureGate } from "./components/FeatureGate.tsx";
import DemoGate from "./pages/DemoGate.tsx";
import AdminDevTools from "./pages/AdminDevTools.tsx";
import CrashTest from "./pages/CrashTest.tsx";
import { addPerformanceMark } from "./lib/sentry.ts";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";

const loadPublicLayout = () => import("./components/PublicLayout.tsx");
const PublicLayout = lazy(loadPublicLayout);
const OnboardingMBS = lazy(() => import("./pages/OnboardingMBS.tsx"));
const SystemCheck = lazy(() => import("./pages/SystemCheck.tsx"));
const DevAudit = lazy(() => import("./pages/DevAudit.tsx"));

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
