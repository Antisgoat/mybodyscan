import { runBodyScan } from "./scanLegacy";

export async function callBodyScan(file: string) {
  return runBodyScan(file);
}
