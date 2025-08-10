import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
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
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCanceled from "./pages/CheckoutCanceled";

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
        <BrowserRouter>
          <Routes>
            {/* Public marketing pages */}
            <Route path="/" element={<PublicLayout><PublicLanding /></PublicLayout>} />
            <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
            <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
