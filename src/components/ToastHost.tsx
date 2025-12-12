import React, { useEffect, useState } from "react";

type ToastItem = {
  id: number;
  message: string;
  level: "info" | "error" | "success" | "warn";
};

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let idSeq = 1;
    const timeouts = new Map<number, number>();

    function onToast(event: Event) {
      const detail = (event as CustomEvent)?.detail as
        | { message?: string; level?: ToastItem["level"] }
        | undefined;
      const message = String(detail?.message || "").trim();
      if (!message) return;
      const level = (detail?.level || "info") as ToastItem["level"];
      const id = idSeq++;
      setItems((current) => [...current, { id, message, level }]);
      const timeout = window.setTimeout(() => {
        setItems((current) => current.filter((toast) => toast.id !== id));
        timeouts.delete(id);
      }, 3500);
      timeouts.set(id, timeout);
    }

    window.addEventListener("mbs:toast", onToast as EventListener);
    return () => {
      window.removeEventListener("mbs:toast", onToast as EventListener);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  return (
    <div style={wrap} aria-live="polite">
      {items.map((toast) => {
        const role: "alert" | "status" =
          toast.level === "error" ? "alert" : "status";
        return (
          <div
            key={toast.id}
            role={role}
            style={{ ...card, ...stylesByLevel(toast.level) }}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  display: "grid",
  gap: 8,
  zIndex: 10000,
};

const card: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  fontSize: 13,
  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  maxWidth: 320,
  wordBreak: "break-word",
};

function stylesByLevel(level: ToastItem["level"]): React.CSSProperties {
  switch (level) {
    case "error":
      return { borderColor: "#ffb3b3", background: "#fff5f5" };
    case "success":
      return { borderColor: "#b3e6b3", background: "#f6fff6" };
    case "warn":
      return { borderColor: "#ffe2a6", background: "#fffbf0" };
    default:
      return {};
  }
}
