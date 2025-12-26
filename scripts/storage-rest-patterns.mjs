export const STORAGE_REST_PATTERNS = [
  {
    label: "Legacy v0 bucket REST endpoint",
    regex: /firebasestorage\.googleapis\.com\/v0\/b\//i,
  },
  {
    label: "Manual object upload query param",
    regex: /o\?name=/i,
  },
  {
    label: "Upload API host (manual REST)",
    regex: /upload\/storage\/v1\/b\//i,
  },
  {
    label: "Encoded scans path without download token",
    regex: /\/(?:o|download)\/scans%2F(?![^?]*alt=media)/i,
  },
];

export function describeStorageRestPattern(pattern) {
  return pattern.label || pattern.regex?.toString() || String(pattern);
}
