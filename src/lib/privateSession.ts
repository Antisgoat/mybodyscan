import { clearCache } from "@/lib/cache";
import { queryClient } from "@/lib/queryClient";
import { resetScanPhotoUrlCache } from "@/lib/storage/photoUrlCache";

export function clearPrivateSessionCaches() {
  resetScanPhotoUrlCache();
  clearCache();
  queryClient.clear();
}
