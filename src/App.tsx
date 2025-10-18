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
// Dynamic imports for large routes to enable code splitting
const Index = lazy(() => import("./pages/Index"));
const WelcomeRedirect = lazy(() => import("./pages/WelcomeRedirect"));
const Auth = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const CapturePicker = lazy(() => import("./pages/CapturePicker"));
const PhotoCapture = lazy(() => import("./pages/PhotoCapture"));
const VideoCapture = lazy(() => import("./pages/VideoCapture"));
const Processing = lazy(() => import("./pages/Processing"));
const Results = lazy(() => import("./pages/Results"));
const History = lazy(() => import("./pages/History"));
const Plans = lazy(() => import("./pages/Plans"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
import { AppCheckProvider } from "./components/AppCheckProvider";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { DataBoundary } from "./components/DataBoundary";
// Dynamic imports for public and feature routes
const PublicLanding = lazy(() => import("./pages/PublicLanding"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Support = lazy(() => import("./pages/Support"));
const Disclaimer = lazy(() => import("./pages/Disclaimer"));
const LegalPrivacy = lazy(() => import("./pages/legal/Privacy"));
const LegalTerms = lazy(() => import("./pages/legal/Terms"));
const LegalRefund = lazy(() => import("./pages/legal/Refund"));
const Help = lazy(() => import("./pages/Help"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const CheckoutCanceled = lazy(() => import("./pages/CheckoutCanceled"));

// Dynamic imports for scan routes (large bundle)
const ScanNew = lazy(() => import("./pages/ScanNew"));
const ScanResult = lazy(() => import("./pages/ScanResult"));
const ScanStart = lazy(() => import("./pages/Scan/Start"));
const ScanCapture = lazy(() => import("./pages/Scan/Capture"));
const ScanFlowResult = lazy(() => import("./pages/Scan/Result"));
const ScanRefine = lazy(() => import("./pages/Scan/Refine"));
const ScanFlowHistory = lazy(() => import("./pages/Scan/History"));
const Scan = lazy(() => import("./pages/Scan"));

// Dynamic imports for coach routes (large bundle)
const Coach = lazy(() => import("./pages/Coach"));
const CoachChat = lazy(() => import("./pages/Coach/Chat"));
const CoachDay = lazy(() => import("./pages/Coach/Day"));
const ProgramsCatalog = lazy(() => import("./pages/Programs"));
const ProgramDetail = lazy(() => import("./pages/Programs/Detail"));
const ProgramsQuiz = lazy(() => import("./pages/Programs/Quiz"));
const CoachOnboarding = lazy(() => import("./pages/CoachOnboarding"));
const CoachTracker = lazy(() => import("./pages/CoachTracker"));

// Dynamic imports for nutrition/meals routes
const Meals = lazy(() => import("./pages/Meals"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const MealsSearch = lazy(() => import("./pages/MealsSearch"));
const BarcodeScan = lazy(() => import("./pages/BarcodeScan"));
const MealsHistory = lazy(() => import("./pages/MealsHistory"));

// Dynamic imports for other routes
const Report = lazy(() => import("./pages/Report"));
const DebugCredits = lazy(() => import("./pages/DebugCredits"));
const PreviewFrame = lazy(() => import("./pages/PreviewFrame"));
const SettingsHealth = lazy(() => import("./pages/SettingsHealth"));
const SettingsUnits = lazy(() => import("./pages/SettingsUnits"));
const DebugPlan = lazy(() => import("./pages/DebugPlan"));
const DebugHealth = lazy(() => import("./pages/DebugHealth"));
const Today = lazy(() => import("./pages/Today"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Workouts = lazy(() => import("./pages/Workouts"));
const WorkoutsLibrary = lazy(() => import("./pages/WorkoutsLibrary"));
const WorkoutsCompleted = lazy(() => import("./pages/WorkoutsCompleted"));
const HealthSync = lazy(() => import("./pages/HealthSync"));
const DemoGate = lazy(() => import("./pages/DemoGate"));
const AdminDevTools = lazy(() => import("./pages/AdminDevTools"));
const AdminCredits = lazy(() => import("./pages/AdminCredits"));
const ScanTips = lazy(() => import("./pages/ScanTips"));
const CrashTest = lazy(() => import("./pages/CrashTest"));
const Ops = lazy(() => import("./pages/Ops"));
import { ConsentGate } from "./components/ConsentGate";
import { DemoModeProvider } from "./components/DemoModeProvider";
import { RouteBoundary } from "./components/RouteBoundary";
import { FeatureGate } from "./components/FeatureGate";
import { addPerformanceMark } from "./lib/sentry";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

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
