import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

interface ConsentGateProps {
  children: React.ReactNode;
  onConsent: () => void;
}

const ConsentGate = ({ children, onConsent }: ConsentGateProps) => {
  const { t } = useTranslation();
  const [hasConsented, setHasConsented] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const consent = localStorage.getItem('mbs-consent');
    if (consent === 'accepted') {
      setHasConsented(true);
    }
  }, []);

  const handleAccept = () => {
    if (acceptedTerms && acceptedPrivacy && acceptedDisclaimer) {
      localStorage.setItem('mbs-consent', 'accepted');
      setHasConsented(true);
      onConsent();
    }
  };

  if (hasConsented) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Welcome to MyBodyScan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Before you continue, please review and accept our policies:
          </p>
          
          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox 
                id="terms" 
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
              />
              <label htmlFor="terms" className="text-sm">
                I accept the{" "}
                <Link to="/legal/terms" className="text-primary hover:underline" target="_blank">
                  Terms of Service
                </Link>
              </label>
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox 
                id="privacy" 
                checked={acceptedPrivacy}
                onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
              />
              <label htmlFor="privacy" className="text-sm">
                I accept the{" "}
                <Link to="/legal/privacy" className="text-primary hover:underline" target="_blank">
                  Privacy Policy
                </Link>
              </label>
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox 
                id="disclaimer" 
                checked={acceptedDisclaimer}
                onCheckedChange={(checked) => setAcceptedDisclaimer(checked === true)}
              />
              <label htmlFor="disclaimer" className="text-sm">
                I understand the{" "}
                <Link to="/legal/disclaimer" className="text-primary hover:underline" target="_blank">
                  Medical Disclaimer
                </Link>
              </label>
            </div>
          </div>

          <Button 
            className="w-full mt-6"
            onClick={handleAccept}
            disabled={!acceptedTerms || !acceptedPrivacy || !acceptedDisclaimer}
          >
            Continue to MyBodyScan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConsentGate;