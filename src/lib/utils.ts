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

// Unit conversion utilities
export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046226218 * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.2046226218) * 10) / 10;
}

export function cmToFt(cm: number): number {
  return Math.floor(cm / 30.48);
}

export function cmToIn(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10;
}

export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 30.48 + inch * 2.54) * 10) / 10;
}

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inch = Math.round(totalInches % 12);
  return { ft, in: inch };
}

// Display formatters with units
export function formatWeight(kg: number, useMetric: boolean): string {
  if (useMetric) {
    return `${kg} kg`;
  }
  return `${kgToLb(kg)} lbs`;
}

export function formatHeight(cm: number, useMetric: boolean): string {
  if (useMetric) {
    return `${cm} cm`;
  }
  const { ft, in: inch } = cmToFtIn(cm);
  return `${ft}'${inch}"`;
}
