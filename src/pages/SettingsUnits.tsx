import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card.tsx";

const SettingsUnits = () => {
  return (
    <main className="p-6 max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Units default to US (lb, ft/in) for v1.</p>
          <p>We&apos;ll add unit customization options in a future update.</p>
        </CardContent>
      </Card>
    </main>
  );
};

export default SettingsUnits;
