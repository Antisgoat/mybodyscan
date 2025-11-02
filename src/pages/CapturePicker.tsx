import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Seo } from "@/components/Seo";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { demoNoAuth } from "@/lib/demoFlag";

const CapturePicker = () => {
  const navigate = useNavigate();
  const demo = useDemoMode();

  const renderButton = (label: string, path: string) => {
    if (!demo || demoNoAuth) {
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
