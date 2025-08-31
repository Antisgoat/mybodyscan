import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot >= 0 ? name.slice(lastDot + 1) : "";
  const cleanBase = base
    .replace(/[\\/\0-\x1F]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 100);
  const cleanExt = ext.replace(/[^A-Za-z0-9]/g, "");
  return cleanExt ? `${cleanBase}.${cleanExt}` : cleanBase;
}
