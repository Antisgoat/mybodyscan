import React from "react";
import { missingEnvVars } from "@/lib/firebase";

export default function EnvBanner() {
  if (!import.meta.env.DEV || missingEnvVars.length === 0) return null;
  return (
    <div className="bg-yellow-200 text-black text-xs text-center py-1">
      Missing env vars: {missingEnvVars.join(", ")}
    </div>
  );
}
