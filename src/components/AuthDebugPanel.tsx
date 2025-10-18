import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { isHostAllowed, getAuthDomainWhitelist } from "@/lib/auth";
import { isAppCheckActive, isAppCheckReady } from "@/lib/appCheck";
import { isProviderEnabled, loadFirebaseAuthClientConfig } from "@/lib/firebaseAuthConfig";
import { ALLOWED_HOSTS } from "@/lib/env";

interface AuthDebugInfo {
  currentHost: string;
  hostAllowed: boolean;
  allowedHosts: string[];
  appCheckEnabled: boolean;
  appCheckReady: boolean;
  googleEnabled: boolean | null;
  appleEnabled: boolean | null;
  lastUpdated: Date;
}

export function AuthDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<AuthDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshDebugInfo = async () => {
    if (typeof window === "undefined") return;
    
    setLoading(true);
    try {
      const currentHost = window.location.hostname;
      const hostAllowed = isHostAllowed(currentHost);
      const allowedHosts = getAuthDomainWhitelist();
      const appCheckEnabled = isAppCheckActive();
      const appCheckReady = isAppCheckReady();
      
      // Load auth provider status
      let googleEnabled: boolean | null = null;
      let appleEnabled: boolean | null = null;
      
      try {
        const config = await loadFirebaseAuthClientConfig();
        googleEnabled = isProviderEnabled("google.com", config);
        appleEnabled = isProviderEnabled("apple.com", config);
      } catch (error) {
        console.warn("[AuthDebugPanel] Failed to load auth config:", error);
      }

      setDebugInfo({
        currentHost,
        hostAllowed,
        allowedHosts,
        appCheckEnabled,
        appCheckReady,
        googleEnabled,
        appleEnabled,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error("[AuthDebugPanel] Failed to refresh debug info:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only show in development and when debug=1 is in URL
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const showDebug = urlParams.get("debug") === "1";
      if (showDebug) {
        refreshDebugInfo();
      }
    }
  }, []);

  // Only render in development with debug=1
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const showDebug = urlParams.get("debug") === "1";
  
  if (!showDebug) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="shadow-lg border-2 border-blue-200 bg-blue-50/95 backdrop-blur-sm">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-blue-100/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-blue-900">
                    🔧 Auth Debug Panel
                  </CardTitle>
                  <CardDescription className="text-xs text-blue-700">
                    Development diagnostics
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      refreshDebugInfo();
                    }}
                    disabled={loading}
                    className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                  >
                    <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-blue-600" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-600" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              {debugInfo ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-900">Current Host:</span>
                      <Badge variant={debugInfo.hostAllowed ? "default" : "destructive"} className="text-xs">
                        {debugInfo.currentHost}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-900">Host Allowed:</span>
                      <Badge variant={debugInfo.hostAllowed ? "default" : "destructive"} className="text-xs">
                        {debugInfo.hostAllowed ? "✅ Yes" : "❌ No"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-900">AppCheck Enabled:</span>
                      <Badge variant={debugInfo.appCheckEnabled ? "default" : "secondary"} className="text-xs">
                        {debugInfo.appCheckEnabled ? "✅ Yes" : "❌ No"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-900">AppCheck Ready:</span>
                      <Badge variant={debugInfo.appCheckReady ? "default" : "secondary"} className="text-xs">
                        {debugInfo.appCheckReady ? "✅ Yes" : "⏳ No"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-900">Google OAuth:</span>
                      <Badge 
                        variant={debugInfo.googleEnabled === true ? "default" : debugInfo.googleEnabled === false ? "destructive" : "secondary"} 
                        className="text-xs"
                      >
                        {debugInfo.googleEnabled === true ? "✅ Enabled" : debugInfo.googleEnabled === false ? "❌ Disabled" : "⏳ Loading"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-900">Apple OAuth:</span>
                      <Badge 
                        variant={debugInfo.appleEnabled === true ? "default" : debugInfo.appleEnabled === false ? "destructive" : "secondary"} 
                        className="text-xs"
                      >
                        {debugInfo.appleEnabled === true ? "✅ Enabled" : debugInfo.appleEnabled === false ? "❌ Disabled" : "⏳ Loading"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-blue-900">Allowed Hosts:</div>
                    <div className="text-xs text-blue-700 bg-blue-100 p-2 rounded max-h-20 overflow-y-auto">
                      {debugInfo.allowedHosts.length > 0 ? (
                        <ul className="space-y-1">
                          {debugInfo.allowedHosts.map((host, index) => (
                            <li key={index} className="font-mono text-xs">
                              • {host}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-blue-600">No hosts configured</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-xs text-blue-600 text-center">
                    Last updated: {debugInfo.lastUpdated.toLocaleTimeString()}
                  </div>
                  
                  {!debugInfo.hostAllowed && (
                    <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded border border-amber-200">
                      ⚠️ Current host not in allowlist. OAuth may be blocked.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-blue-600 text-center">
                  {loading ? "Loading debug info..." : "Click refresh to load debug info"}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}