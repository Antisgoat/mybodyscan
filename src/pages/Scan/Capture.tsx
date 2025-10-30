import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Seo } from "@/components/Seo";
import { useToast } from "@/hooks/use-toast";
import {
  CAPTURE_VIEW_SETS,
  type CaptureView,
  pruneCaptureFiles,
  setCaptureFile,
  setCaptureMode,
  useScanCaptureStore,
} from "./scanCaptureStore";
import { MIN_IMAGE_DIMENSION, isAllowedImageType, readImageDimensions } from "@/lib/imageValidation";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export default function ScanCapture() {
  const navigate = useNavigate();
  const { mode, files } = useScanCaptureStore();
  const shots = useMemo(() => CAPTURE_VIEW_SETS[mode], [mode]);
  const inputRefs = useRef<Partial<Record<CaptureView, HTMLInputElement | null>>>({});
  const [previews, setPreviews] = useState<Partial<Record<CaptureView, string>>>({});
  const fileRefs = useRef<Partial<Record<CaptureView, File>>>({});
  const previewRef = useRef(previews);
  const { toast } = useToast();

  useEffect(() => {
    setPreviews((prev) => {
      const next: Partial<Record<CaptureView, string>> = {};
      const nextFileRefs: Partial<Record<CaptureView, File>> = {};

      for (const view of Object.keys(files) as CaptureView[]) {
        const file = files[view];
        if (!file) continue;

        const prevFile = fileRefs.current[view];
        const prevUrl = prev[view];
        if (prevFile === file && prevUrl) {
          next[view] = prevUrl;
        } else {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          next[view] = URL.createObjectURL(file);
        }
        nextFileRefs[view] = file;
      }

      for (const view of Object.keys(prev) as CaptureView[]) {
        if (!next[view]) {
          const prevUrl = prev[view];
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
        }
      }

      fileRefs.current = nextFileRefs;
      return next;
    });
  }, [files]);

  useEffect(() => {
    previewRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(previewRef.current)) {
        if (url) {
          URL.revokeObjectURL(url);
        }
      }
    };
  }, []);

  const handleModeChange = (value: string) => {
    if (value === "2" || value === "4") {
      setCaptureMode(value);
      pruneCaptureFiles(CAPTURE_VIEW_SETS[value]);
    }
  };

  const handleFileChange = (view: CaptureView) => (event: ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target;
    const file = inputEl.files?.[0] ?? null;
    inputEl.value = "";
    if (!file) {
      setCaptureFile(view, undefined);
      return;
    }

    if (!isAllowedImageType(file)) {
      toast({ title: "Unsupported photo", description: "Use JPEG or PNG photos.", variant: "destructive" });
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "Photo too large", description: "Each photo must be under 15 MB.", variant: "destructive" });
      return;
    }

    void (async () => {
      try {
        const { width, height } = await readImageDimensions(file);
        if (Math.min(width, height) < MIN_IMAGE_DIMENSION) {
          toast({
            title: "Photo too small",
            description: `Photos must be at least ${MIN_IMAGE_DIMENSION}px on the shortest side.`,
            variant: "destructive",
          });
          return;
        }
        setCaptureFile(view, file);
      } catch {
        toast({
          title: "Photo unreadable",
          description: "Select a different photo and try again.",
          variant: "destructive",
        });
      }
    })();
  };

  const handleRemove = (view: CaptureView) => {
    setCaptureFile(view, undefined);
  };

  const allCaptured = useMemo(
    () => shots.every((view) => Boolean(files[view])),
    [shots, files],
  );

  const onAnalyze = () => {
    if (!allCaptured) return;
    navigate("/scan/result");
  };

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
          onValueChange={handleModeChange}
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
            {shots.map((view) => {
              const previewUrl = previews[view];
              const file = files[view];

              return (
                <li
                  key={view}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {previewUrl ? (
                        <img src={previewUrl} alt={`${view} preview`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="px-2 text-center text-xs text-muted-foreground">No photo</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{view}</p>
                      <p className="text-sm text-muted-foreground">
                        {file ? file.name : "Add a photo to continue."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={(node) => {
                        inputRefs.current[view] = node;
                      }}
                      id={`capture-${view}`}
                      type="file"
                      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange(view)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => inputRefs.current[view]?.click()}
                    >
                      {file ? "Retake" : "Upload"}
                    </Button>
                    {file ? (
                      <Button variant="ghost" size="sm" type="button" onClick={() => handleRemove(view)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={onAnalyze} disabled={!allCaptured}>
          Analyze
        </Button>
      </div>
    </div>
  );
}
