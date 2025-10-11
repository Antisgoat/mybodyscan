import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot >= 0 ? name.slice(lastDot + 1) : "";
  const strippedBase = Array.from(base)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (ch === "/" || ch === "\\") return false;
      if (code < 32 || code === 127) return false;
      return true;
    })
    .join("");
  const cleanBase = strippedBase.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  const cleanExt = ext.replace(/[^A-Za-z0-9]/g, "");
  return cleanExt ? `${cleanBase}.${cleanExt}` : cleanBase;
}
