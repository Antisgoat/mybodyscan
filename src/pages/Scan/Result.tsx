import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";

export default function ScanFlowResult() {
  return (
    <div className="space-y-6">
      <Seo title="Scan Result Preview – MyBodyScan" description="Review the draft estimate before finalizing." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Preview Result</h1>
        <p className="text-muted-foreground">This placeholder shows where your next estimate will appear.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Estimated body metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
            Estimate placeholder
          </div>
          <Button className="w-full" disabled>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
