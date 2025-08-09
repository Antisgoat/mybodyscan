import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { useNavigate } from "react-router-dom";

const CapturePicker = () => {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Choose Capture – MyBodyScan" description="Pick photos or video to start your scan." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Start a Scan</h1>
      <div className="grid gap-4">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/capture/photos")}>
              Capture Photos
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Video</CardTitle>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/capture/video")}>
              Record Video
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default CapturePicker;
