import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  consumeCreditUI,
  pollUntilComplete,
  startScanSession,
  type PollResponse,
} from "@/lib/scan";

type ScanFlowPhase = "idle" | "prepared" | "uploading" | "polling" | "done" | "failed";

type ScanFlowProps = {
  className?: string;
};

function describeTick(response: PollResponse): string {
  switch (response.status) {
    case "queued":
      return "Waiting in queue…";
    case "uploading":
      return "Upload received. Preparing analysis…";
    case "processing":
      return "Analyzing scan…";
    case "complete":
      return "Scan complete.";
    case "failed":
      return response.error ? `Scan failed: ${response.error}` : "Scan failed.";
    case "timeout":
      return "Scan timed out.";
    default:
      return "Processing…";
  }
}

export default function ScanFlow({ className }: ScanFlowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ScanFlowPhase>("idle");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [uploadUrl, setUploadUrl] = useState<string>("");
  const [uploadHeaders, setUploadHeaders] = useState<Record<string, string> | undefined>();
  const [resultUrl, setResultUrl] = useState<string>("");

  const canStart = useMemo(
    () =>
      Boolean(selectedFile) &&
      (phase === "idle" || phase === "prepared" || phase === "failed"),
    [phase, selectedFile],
  );

  const canRetryUpload = phase === "failed" && Boolean(sessionId) && Boolean(uploadUrl) && Boolean(selectedFile);
  const canOpenResult = phase === "done" && Boolean(resultUrl);

  const handleChoose = useCallback(() => {
    setError("");
    setStatus("");
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSessionId("");
    setUploadUrl("");
    setUploadHeaders(undefined);
    setResultUrl("");
    setError("");
    setPhase("idle");
    setStatus(file ? `Selected: ${file.name}` : "");
  }, []);

  const resetToIdle = useCallback(() => {
    setSelectedFile(null);
    setSessionId("");
    setUploadUrl("");
    setUploadHeaders(undefined);
    setResultUrl("");
    setPhase("idle");
    setStatus("");
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const doUploadAndPoll = useCallback(
    async (file: File, sid: string, url: string, headers?: Record<string, string>) => {
      try {
        setPhase("uploading");
        setStatus("Uploading…");

        const uploadHeadersToSend: Record<string, string> = { ...(headers ?? {}) };
        if (!uploadHeadersToSend["content-type"] && file.type) {
          uploadHeadersToSend["content-type"] = file.type;
        }

        const response = await fetch(url, {
          method: "PUT",
          headers: uploadHeadersToSend,
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Upload failed (status ${response.status})`);
        }

        setPhase("polling");
        setStatus("Processing…");

        const pollResponse = await pollUntilComplete(sid, (tick) => {
          setStatus(describeTick(tick));
        });

        if (pollResponse.status === "complete") {
          setPhase("done");
          setStatus(describeTick(pollResponse));
          setResultUrl(pollResponse.resultUrl ?? "");
          setError("");
          await consumeCreditUI(sid);
        } else if (pollResponse.status === "timeout") {
          setPhase("failed");
          setError("Scan timed out. You can retry from upload.");
        } else {
          setPhase("failed");
          setError(pollResponse.error ? `Scan failed: ${pollResponse.error}` : "Scan failed. You can retry from upload.");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
        setPhase("failed");
        setError(message);
      }
    },
    [],
  );

  const handleStart = useCallback(async () => {
    if (!selectedFile) return;
    setError("");
    setResultUrl("");
    setPhase("prepared");
    setStatus("Preparing upload…");
    try {
      const session = await startScanSession({ mime: selectedFile.type, size: selectedFile.size });
      setSessionId(session.sessionId);
      setUploadUrl(session.uploadUrl);
      setUploadHeaders(session.uploadHeaders);
      await doUploadAndPoll(selectedFile, session.sessionId, session.uploadUrl, session.uploadHeaders);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
      setPhase("failed");
      setError(`Failed to start: ${message}`);
    }
  }, [doUploadAndPoll, selectedFile]);

  const handleRetryUpload = useCallback(async () => {
    if (!selectedFile) {
      return;
    }
    if (!sessionId || !uploadUrl) {
      await handleStart();
      return;
    }
    setError("");
    setStatus("Retrying upload…");
    await doUploadAndPoll(selectedFile, sessionId, uploadUrl, uploadHeaders);
  }, [doUploadAndPoll, handleStart, selectedFile, sessionId, uploadHeaders, uploadUrl]);

  return (
    <div className={className} style={wrapperStyle}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div style={rowStyle}>
        <button type="button" onClick={handleChoose} style={primaryButtonStyle}>
          Choose File
        </button>
        <button type="button" onClick={handleStart} style={primaryButtonStyle} disabled={!canStart}>
          Start Scan
        </button>
        <button type="button" onClick={resetToIdle} style={secondaryButtonStyle}>
          Reset
        </button>
      </div>

      {selectedFile ? (
        <div style={hintStyle}>
          Selected: <strong>{selectedFile.name}</strong> ({Math.round(selectedFile.size / 1024)} KB)
        </div>
      ) : null}

      {status ? <div style={statusStyle}>{status}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={rowStyle}>
        {canRetryUpload ? (
          <button type="button" onClick={handleRetryUpload} style={primaryButtonStyle}>
            Retry from upload
          </button>
        ) : null}
        {canOpenResult && resultUrl ? (
          <a href={resultUrl} target="_blank" rel="noreferrer" style={linkButtonStyle}>
            Open result
          </a>
        ) : null}
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = { display: "grid", gap: 12, maxWidth: 720 };
const rowStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
};
const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #eee",
  borderRadius: 8,
  background: "#f8f8f8",
  cursor: "pointer",
};
const hintStyle: React.CSSProperties = { fontSize: 12, color: "#666" };
const statusStyle: React.CSSProperties = { fontSize: 12, color: "#333" };
const errorStyle: React.CSSProperties = { fontSize: 12, color: "#b00020" };
const linkButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  textDecoration: "none",
};

