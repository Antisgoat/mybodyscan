import React, { useEffect, useState } from "react";
import type { Pose } from "./poses";

const guidance: Record<Pose, string> = {
  front:
    "Face the camera. Keep your arms relaxed, slightly away from your sides.",
  back: "Face away from the camera. Keep your shoulders relaxed and both feet visible.",
  left: "Show your left side to the camera. Stand naturally without twisting.",
  right:
    "Show your right side to the camera. Use the same posture as the left side.",
};

/** Local-only review: object URLs are revoked when a photo changes or the view unmounts. */
export function ScanPhotoReview({
  file,
  pose,
}: {
  file: File | null;
  pose: Pose;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null
  );
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Never briefly render the previous account/photo while the effect catches up.
  const url = preview?.file === file ? preview?.url : undefined;
  return (
    <span className="flex flex-col gap-2 normal-case font-normal">
      <span
        className={`flex items-center justify-center overflow-hidden rounded-xl bg-muted/50 ${file ? "h-56 sm:h-64" : "h-24"}`}
      >
        {url ? (
          <img
            src={url}
            alt={`${pose} photo review — check your full body is visible`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="px-4 text-center text-sm text-muted-foreground">
            Head to toe · {pose} view
          </span>
        )}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {guidance[pose]}
      </span>
      {file ? (
        <span className="text-xs text-muted-foreground">
          Review framing and sharpness. Choose another photo below to replace
          it.
        </span>
      ) : null}
    </span>
  );
}
