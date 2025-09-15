import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";

interface ConsentGateProps {
  children: React.ReactNode;
}

export function ConsentGate({ children }: ConsentGateProps) {
  const { t } = useI18n();
  const [hasConsented, setHasConsented] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('mbs-consent');
    if (consent === 'accepted') {
      setHasConsented(true);
    }
  }, []);

  const handleAccept = () => {
    if (acceptedTerms && acceptedPrivacy && acceptedDisclaimer) {
      localStorage.setItem('mbs-consent', 'accepted');
      setHasConsented(true);
    }
  };

  if (hasConsented) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Welcome to MyBodyScan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground text-center">
            Before using our app, please review and accept our policies
          </p>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox 
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                className="mt-1"
              />
              <div className="text-sm">
                <span>I accept the </span>
                <a href="/legal/terms" target="_blank" className="text-primary underline hover:no-underline">
                  Terms of Service
                </a>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <Checkbox 
                checked={acceptedPrivacy}
                onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
                className="mt-1"
              />
              <div className="text-sm">
                <span>I accept the </span>
                <a href="/legal/privacy" target="_blank" className="text-primary underline hover:no-underline">
                  Privacy Policy
                </a>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <Checkbox 
                checked={acceptedDisclaimer}
                onCheckedChange={(checked) => setAcceptedDisclaimer(checked === true)}
                className="mt-1"
              />
              <div className="text-sm">
                <span>I understand the </span>
                <a href="/legal/disclaimer" target="_blank" className="text-primary underline hover:no-underline">
                  Medical Disclaimer
                </a>
              </div>
            </div>
          </div>
          
          <Button 
            onClick={handleAccept}
            disabled={!acceptedTerms || !acceptedPrivacy || !acceptedDisclaimer}
            className="w-full"
          >
            {t('legal.accept')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}