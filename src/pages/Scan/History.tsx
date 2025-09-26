import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";

export default function ScanFlowHistory() {
  return (
    <div className="space-y-6">
      <Seo title="Scan Flow History – MyBodyScan" description="Review past runs of the new scan flow." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Scan Flow History</h1>
        <p className="text-muted-foreground">A simple placeholder list until data wiring is ready.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Session placeholder #1</li>
            <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Session placeholder #2</li>
            <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Session placeholder #3</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
