import { runBodyScan } from "./scan";

export async function callBodyScan(file: string) {
  return runBodyScan(file);
}
