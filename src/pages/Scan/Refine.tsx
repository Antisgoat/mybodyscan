import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";

export default function ScanRefine() {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-6">
      <Seo title="Refine Estimate – MyBodyScan" description="Fine-tune your scan results with manual inputs." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Refine Scan</h1>
        <p className="text-muted-foreground">Adjust the estimate with quick manual measurements.</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Edit measurements</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refine estimate</DialogTitle>
            <DialogDescription>Enter manual measurements to update the result preview.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refine-neck">Neck (in)</Label>
              <Input id="refine-neck" type="number" min="0" step="0.1" placeholder="13.5" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refine-waist">Waist (in)</Label>
              <Input id="refine-waist" type="number" min="0" step="0.1" placeholder="32.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refine-hip">Hip (in)</Label>
              <Input id="refine-hip" type="number" min="0" step="0.1" placeholder="38.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled>Save adjustments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
