import { CapacitorHttp } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/platform/isNative";

export type NativeHttpResponse = {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
  statusText?: string;
};

export function canUseNativeHttp(): boolean {
  return isCapacitorNative() && typeof CapacitorHttp?.request === "function";
}

export async function nativeHttpRequest(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: unknown;
}): Promise<NativeHttpResponse> {
  const response = await CapacitorHttp.request({
    url: options.url,
    method: options.method,
    headers: options.headers,
    data: options.data,
  });
  return {
    status: response.status,
    data: response.data,
    headers: response.headers,
    statusText: response.statusText,
  };
}
