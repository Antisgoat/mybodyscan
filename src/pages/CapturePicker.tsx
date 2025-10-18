import { Button } from "@app/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/ui/tooltip.tsx";
import { Seo } from "@app/components/Seo.tsx";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@app/components/DemoModeProvider.tsx";
import { demoToast } from "@app/lib/demoToast.ts";

const CapturePicker = () => {
  const navigate = useNavigate();
  const demo = useDemoMode();

  const renderButton = (label: string, path: string) => {
    if (!demo) {
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
        <TooltipContent>Sign in to use</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo
        title="Choose Capture – MyBodyScan"
        description="Pick photos or video to start your scan."
        canonical={window.location.href}
      />
      <h1 className="text-2xl font-semibold mb-4">Start a Scan</h1>
      <div className="grid gap-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent>{renderButton("Capture Photos", "/capture/photos")}</CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Video</CardTitle>
          </CardHeader>
          <CardContent>{renderButton("Record Video", "/capture/video")}</CardContent>
        </Card>
      </div>
    </main>
  );
};

export default CapturePicker;
