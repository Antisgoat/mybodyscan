import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Seo } from "@/components/Seo";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { useAuthUser } from "@/auth/mbs-auth";

const CapturePicker = () => {
  const navigate = useNavigate();
  const demo = useDemoMode();
  const { user } = useAuthUser();
  const readOnlyDemo = demo && !user;

  const renderButton = (label: string, path: string) => {
    if (!readOnlyDemo) {
      return (
        <Button className="w-full" onClick={() => navigate(path)}>
          {label}
        </Button>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full" onClick={() => demoToast()}>
            <Button className="w-full pointer-events-none" disabled>
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Sign up to use this feature</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo
        title="Choose Capture – MyBodyScan"
        description="Pick the four photo angles required for your scan."
        canonical={window.location.href}
      />
      <h1 className="text-2xl font-semibold mb-4">Start a Scan</h1>
      <div className="grid gap-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent>
            {renderButton("Capture Photos", "/capture/photos")}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default CapturePicker;
