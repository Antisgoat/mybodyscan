import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "./context/AuthContext";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/capture" element={<ProtectedRoute><CapturePicker /></ProtectedRoute>} />
            <Route path="/capture/photos" element={<ProtectedRoute><PhotoCapture /></ProtectedRoute>} />
            <Route path="/capture/video" element={<ProtectedRoute><VideoCapture /></ProtectedRoute>} />
            <Route path="/processing/:uid/:scanId" element={<ProtectedRoute><Processing /></ProtectedRoute>} />
            <Route path="/results/:uid/:scanId" element={<ProtectedRoute><Results /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
