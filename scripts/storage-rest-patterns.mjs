export const STORAGE_REST_PATTERNS = [
  {
    label: "Direct Firebase Storage REST host",
    regex: /firebasestorage\.googleapis\.com/i,
  },
  {
    label: "Legacy v0 bucket REST endpoint",
    regex: /firebasestorage\.googleapis\.com\/v0\/b\//i,
  },
  {
    label: "Manual object upload query param",
    regex: /o\?name=/i,
  },
  {
    label: "Encoded manual object upload query param",
    regex: /o%3fname%3d/i,
  },
  {
    label: "Upload API host (manual REST)",
    regex: /upload\/storage\/v1\/b\//i,
  },
  {
    label: "Concatenated Firebase Storage REST host fragments",
    regex: /firebasestorage[^a-z0-9]{0,12}googleapis\.com/i,
  },
  {
    label: "Encoded scans path without download token",
    regex: /\/(?:o|download)\/scans%2F(?![^?]*alt=media)/i,
  },
];

export function describeStorageRestPattern(pattern) {
  return pattern.label || pattern.regex?.toString() || String(pattern);
}
