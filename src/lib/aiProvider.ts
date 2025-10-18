import { runBodyScan } from "./scan.ts";

export async function callBodyScan(file: string) {
  return runBodyScan(file);
}
