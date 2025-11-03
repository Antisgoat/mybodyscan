export function sanitizeFoodItem(q: string) {
  return (q ?? "").toString().trim().replace(/\s+/g, " ").slice(0, 80);
}
