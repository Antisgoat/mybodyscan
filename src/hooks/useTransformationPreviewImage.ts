import { useEffect, useState } from "react";
import { loadTransformationPreviewBlob } from "@/lib/transformationPreview";

export const PREVIEW_IMAGE_LOAD_TIMEOUT_MS = 20_000;
type ImageState = {
  path: string | null;
  url: string | null;
  status: "loading" | "ready" | "error";
};

/** Download retries only fetch the existing private image; they never generate a new one. */
export function useTransformationPreviewImage(path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImageState | null>(null);

  useEffect(() => {
    if (!path) {
      setState(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    setState({ path, url: null, status: "loading" });
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      setState({ path, url: null, status: "error" });
    }, PREVIEW_IMAGE_LOAD_TIMEOUT_MS);

    void loadTransformationPreviewBlob(path)
      .then((blob) => {
        if (!active) return;
        clearTimeout(timeout);
        objectUrl = URL.createObjectURL(blob);
        setState({ path, url: objectUrl, status: "ready" });
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(timeout);
        setState({ path, url: null, status: "error" });
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt]);

  // Hide the prior scan's image immediately, before effect cleanup runs.
  const current = state?.path === path ? state : null;
  return {
    url: current?.url ?? null,
    status: current?.status ?? "loading",
    retry: () => setAttempt((value) => value + 1),
    onImageError: () => setState({ path, url: null, status: "error" }),
  };
}
