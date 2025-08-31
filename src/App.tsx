import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import React, { useEffect, lazy } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthGate from "./components/AuthGate";
import OnboardingRedirectMBS from "./components/OnboardingRedirectMBS";
import AuthedLayout from "./components/AuthedLayout";
import { initAuthPersistence } from "./lib/auth";
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
import PublicLayout from "./components/PublicLayout";
import PublicLanding from "./pages/PublicLanding";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Support from "./pages/Support";
import Disclaimer from "./pages/Disclaimer";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCanceled from "./pages/CheckoutCanceled";
import ScanNew from "./pages/ScanNew";
import ScanResult from "./pages/ScanResult";
import Report from "./pages/Report";
import DebugCredits from "./pages/DebugCredits";
import CoachOnboarding from "./pages/CoachOnboarding";
import CoachTracker from "./pages/CoachTracker";
import SettingsHealth from "./pages/SettingsHealth";
import SettingsUnits from "./pages/SettingsUnits";
import DebugPlan from "./pages/DebugPlan";
import DebugHealth from "./pages/DebugHealth";

const OnboardingMBS = lazy(() => import("./pages/OnboardingMBS"));

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    initAuthPersistence().catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthGate>
          <BrowserRouter>
            <OnboardingRedirectMBS>
              <Routes>
            {/* Public marketing pages */}
            <Route path="/" element={<PublicLayout><PublicLanding /></PublicLayout>} />
            <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
            <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
            <Route path="/legal/disclaimer" element={<PublicLayout><Disclaimer /></PublicLayout>} />
            <Route path="/support" element={<PublicLayout><Support /></PublicLayout>} />
            {/* Checkout result pages (public) */}
            <Route path="/checkout/success" element={<PublicLayout><CheckoutSuccess /></PublicLayout>} />
            <Route path="/checkout/canceled" element={<PublicLayout><CheckoutCanceled /></PublicLayout>} />
            {/* Auth */}
            <Route path="/auth" element={<Auth />} />
            {/* Protected app */}
            <Route path="/home" element={<ProtectedRoute><AuthedLayout><Home /></AuthedLayout></ProtectedRoute>} />
            {/* Capture routes (old + new kept) */}
            <Route path="/capture" element={<ProtectedRoute><AuthedLayout><CapturePicker /></AuthedLayout></ProtectedRoute>} />
            <Route path="/capture/photos" element={<ProtectedRoute><AuthedLayout><PhotoCapture /></AuthedLayout></ProtectedRoute>} />
            <Route path="/capture/video" element={<ProtectedRoute><AuthedLayout><VideoCapture /></AuthedLayout></ProtectedRoute>} />
            <Route path="/capture-picker" element={<ProtectedRoute><AuthedLayout><CapturePicker /></AuthedLayout></ProtectedRoute>} />
            <Route path="/photo-capture" element={<ProtectedRoute><AuthedLayout><PhotoCapture /></AuthedLayout></ProtectedRoute>} />
            <Route path="/video-capture" element={<ProtectedRoute><AuthedLayout><VideoCapture /></AuthedLayout></ProtectedRoute>} />
            {/* Processing routes (old + new kept) */}
            <Route path="/processing/:uid/:scanId" element={<ProtectedRoute><AuthedLayout><Processing /></AuthedLayout></ProtectedRoute>} />
            <Route path="/processing/:scanId" element={<ProtectedRoute><AuthedLayout><Processing /></AuthedLayout></ProtectedRoute>} />
            {/* Results */}
            <Route path="/results/:scanId" element={<ProtectedRoute><AuthedLayout><Results /></AuthedLayout></ProtectedRoute>} />
            {/* Other */}
            <Route path="/history" element={<ProtectedRoute><AuthedLayout><History /></AuthedLayout></ProtectedRoute>} />
            <Route path="/plans" element={<ProtectedRoute><AuthedLayout><Plans /></AuthedLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><AuthedLayout><Settings /></AuthedLayout></ProtectedRoute>} />
            <Route path="/settings/units" element={<ProtectedRoute><AuthedLayout><SettingsUnits /></AuthedLayout></ProtectedRoute>} />
            <Route path="/coach/onboarding" element={<ProtectedRoute><AuthedLayout><CoachOnboarding /></AuthedLayout></ProtectedRoute>} />
            <Route path="/coach/tracker" element={<ProtectedRoute><AuthedLayout><CoachTracker /></AuthedLayout></ProtectedRoute>} />
            <Route path="/settings/health" element={<ProtectedRoute><AuthedLayout><SettingsHealth /></AuthedLayout></ProtectedRoute>} />
            {/* New scan routes */}
            <Route path="/scan/new" element={<ProtectedRoute><AuthedLayout><ScanNew /></AuthedLayout></ProtectedRoute>} />
            <Route path="/scan/:scanId" element={<ProtectedRoute><AuthedLayout><ScanResult /></AuthedLayout></ProtectedRoute>} />
            {/* Report routes */}
            <Route path="/report" element={<ProtectedRoute><AuthedLayout><Report /></AuthedLayout></ProtectedRoute>} />
            <Route path="/report/:scanId" element={<ProtectedRoute><AuthedLayout><Report /></AuthedLayout></ProtectedRoute>} />
            <Route path="/debug/credits" element={<DebugCredits />} />
            <Route path="/debug/plan" element={<DebugPlan />} />
            <Route path="/debug/health" element={<DebugHealth />} />
            {/* MBS Onboarding */}
            <Route
              path="/onboarding-mbs"
              element={
                <React.Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
                  <OnboardingMBS />
                </React.Suspense>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
              </Routes>
            </OnboardingRedirectMBS>
        </BrowserRouter>
      </AuthGate>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
