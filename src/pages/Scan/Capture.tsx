import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Seo } from "@/components/Seo";

const PHOTO_SETS: Record<"2" | "4", string[]> = {
  "2": ["Front", "Side"],
  "4": ["Front", "Back", "Left", "Right"],
};

export default function ScanCapture() {
  const [mode, setMode] = useState<"2" | "4">("2");

  const shots = useMemo(() => PHOTO_SETS[mode], [mode]);

  return (
    <div className="space-y-6">
      <Seo title="Capture Photos – MyBodyScan" description="Select how many angles to capture for your scan." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Capture Photos</h1>
        <p className="text-muted-foreground">Choose the angles you will capture. Camera integration arrives later.</p>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Capture mode</p>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value === "2" || value === "4") {
              setMode(value);
            }
          }}
          className="grid w-full grid-cols-2 gap-2"
        >
          <ToggleGroupItem value="2" aria-label="Capture two photos" className="py-3">
            2 photos
          </ToggleGroupItem>
          <ToggleGroupItem value="4" aria-label="Capture four photos" className="py-3">
            4 photos
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Planned shots</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {shots.map((label) => (
              <li key={label} className="flex items-center justify-between">
                <span>{label}</span>
                <Button variant="outline" size="sm" disabled>
                  Pending
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
