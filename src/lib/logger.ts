export type Breadcrumb = {
  t: number;
  level: "info" | "warn" | "error";
  msg: string;
  ctx?: Record<string, any>;
};
const MAX = 50;
const Q: Breadcrumb[] = [];
export function log(
  level: Breadcrumb["level"],
  msg: string,
  ctx?: Record<string, any>
) {
  Q.push({ t: Date.now(), level, msg, ctx });
  if (Q.length > MAX) Q.shift();
  if (import.meta.env.DEV) console[level](msg, ctx || "");
}
export function getBreadcrumbs(): Breadcrumb[] {
  return [...Q];
}
