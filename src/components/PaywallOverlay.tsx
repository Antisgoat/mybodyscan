import { ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Lock } from 'lucide-react';

interface PaywallOverlayProps {
  children: ReactNode;
  feature: string;
  description: string;
  showOverlay: boolean;
}

export function PaywallOverlay({ children, feature, description, showOverlay }: PaywallOverlayProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  if (!showOverlay) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="filter blur-sm pointer-events-none">
        {children}
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="p-6 space-y-4">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">{feature} Premium Feature</h3>
              <p className="text-sm text-muted-foreground mt-2">{description}</p>
            </div>
            <Button 
              onClick={() => navigate('/plans')}
              className="w-full"
            >
              Upgrade Now
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}