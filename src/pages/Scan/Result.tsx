import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { CAPTURE_VIEW_SETS, useScanCaptureStore } from "./scanCaptureStore";

export default function ScanFlowResult() {
  const { mode, files } = useScanCaptureStore();
  const shots = useMemo(() => CAPTURE_VIEW_SETS[mode], [mode]);
  const capturedShots = shots.filter((view) => Boolean(files[view]));
  const allCaptured = capturedShots.length === shots.length;

  return (
    <div className="space-y-6">
      <Seo title="Scan Result Preview – MyBodyScan" description="Review the draft estimate before finalizing." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Preview Result</h1>
        <p className="text-muted-foreground">
          {allCaptured
            ? "Your images are ready. This placeholder shows where your next estimate will appear."
            : "We need every required angle before we can analyze your scan."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Estimated body metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-medium">Captured photos</h2>
            <ul className="space-y-2">
              {shots.map((view) => {
                const file = files[view];
                return (
                  <li key={view} className="flex items-center justify-between rounded-md border p-3">
                    <span className="font-medium">{view}</span>
                    {file ? (
                      <span className="text-sm text-muted-foreground">
                        {file.name} · {(file.size / 1024).toFixed(0)} KB
                      </span>
                    ) : (
                      <span className="text-sm text-destructive">Missing</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
            Estimate placeholder
          </div>
          <Button className="w-full" disabled={!allCaptured}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
