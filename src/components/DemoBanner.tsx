import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "./DemoModeProvider";

export function DemoBanner() {
  const navigate = useNavigate();
  const demo = useDemoMode();

  if (!demo) return null;

  return (
    <Card className="bg-muted/50 border-muted">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            You're exploring MyBodyScan in demo mode. Sign up anytime to unlock scans and save your progress.
          </p>
        </div>
        <Button 
          size="sm" 
          variant="default" 
          className="ml-4 text-xs"
          onClick={() => navigate("/auth")}
        >
          Create free account
        </Button>
      </CardContent>
    </Card>
  );
}