import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
fs.mkdirSync(reportsDir, { recursive: true });

function safeExec(cmd) {
  try { return { ok: true, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore","pipe","pipe"] }) }; }
  catch (e) {
    const out = (e.stdout?.toString?.() || "") + (e.stderr?.toString?.() || "");
    return { ok: false, out, code: e.status ?? 1 };
  }
}
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(path.join(root, rel), "utf8") : ""; }

const ts = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "Z");
const graphOut = safeExec("node scripts/audit-graph.mjs");
if (!graphOut.ok) {
  const errPath = path.join(reportsDir, `audit-graph-error-${ts}.log`);
  fs.writeFileSync(errPath, graphOut.out);
  console.error("audit-graph failed; see", errPath);
  process.exit(2);
}
const graphJsonPath = path.join(reportsDir, "import-graph.json");
fs.writeFileSync(graphJsonPath, graphOut.out);
const graph = JSON.parse(graphOut.out);

// firebase.json checks
const fb = readJsonSafe(path.join(root, "firebase.json")) || {};
const rewrites = fb?.hosting?.rewrites || [];
const headers  = fb?.hosting?.headers || [];

function hasRewrite(source, fnId) {
  return rewrites.some(r => r?.source === source && ((r.function?.functionId || r.function) === fnId));
}
function hasIndexNoStore() {
  return headers.some(h => h.source === "/index.html" &&
    (h.headers || []).some(x => x.key?.toLowerCase() === "cache-control" && /no-store/i.test(x.value||"")));
}

// code presence checks
const checks = {
  rewrites: {
    ok: hasRewrite("/api/system/health","systemHealth")
     && hasRewrite("/api/coach/chat","coachChat")
     && hasRewrite("/api/nutrition/search","nutritionSearch")
     && hasRewrite("/api/createCheckout","createCheckout")
     && hasRewrite("/api/createCustomerPortal","createCustomerPortal"),
  },
  indexNoStore: { ok: hasIndexNoStore() },
  appCheckClient: { ok: exists("src/lib/appCheck.ts") && /initializeAppCheck/.test(read("src/lib/appCheck.ts")) },
  appCheckSoftServer: { ok: /appCheckSoft\s*\(/.test(read("functions/src/http/appCheckSoft.ts") + read("functions/src/index.ts") + read("functions/src/http/index.ts")) },
  demoSignedOutOnly: { ok: /auth\.currentUser/.test(read("src/lib/demo.ts")) && /VITE_DEMO_MODE/.test(read("src/lib/demo.ts")) },
  adminUnlimited: { ok: exists("src/lib/useUserClaims.ts") && /Unlimited/.test(read("src/components/CreditsBadge.tsx")||"") },
  fallbackClient: { ok: exists("src/lib/api/urls.ts") && /apiFetchWithFallback/.test(read("src/lib/http.ts")) },
  nutritionSanitizer: { ok: exists("src/lib/nutrition/sanitize.ts") && /sanitizeFoodItem/.test(read("src/lib/nutrition/sanitize.ts")) },
};

// package scripts / typecheck (best-effort)
const pkg = readJsonSafe(path.join(root, "package.json")) || {};
const hasTypecheck = !!pkg?.scripts?.typecheck;
const tc = hasTypecheck ? safeExec("npm run -s typecheck") : { ok: false, out: "No typecheck script." };

// Build a small matrix
function statusEmoji(ok) { return ok ? "✅" : "❌"; }

const matrix = [
  ["Hosting rewrites", checks.rewrites.ok, "firebase.json rewrites for /api/*"],
  ["Fresh index (no-store)", checks.indexNoStore.ok, "firebase.json headers for /index.html"],
  ["App Check (client init)", checks.appCheckClient.ok, "src/lib/appCheck.ts"],
  ["App Check SOFT (server)", checks.appCheckSoftServer.ok, "functions/src/http/appCheckSoft.ts usage"],
  ["Demo signed-out only", checks.demoSignedOutOnly.ok, "src/lib/demo.ts checks auth.currentUser"],
  ["Admin credits “Unlimited”", checks.adminUnlimited.ok, "useUserClaims + CreditsBadge"],
  ["Unified API + fallback", checks.fallbackClient.ok, "api/urls + apiFetchWithFallback"],
  ["Nutrition sanitizer", checks.nutritionSanitizer.ok, "src/lib/nutrition/sanitize.ts"],
];

const topDead = (graph.deadFiles || []).slice(0, 25);
const topStray = (graph.strayFetchCalls || []).slice(0, 25);

const md = `# MyBodyScan — Full Repo Audit (Generated: ${ts})
> This report is read‑only. No app code was changed. Use it to drive a cleanup/fix PR.

## Executive Summary
- Import graph files: **${graph.importGraphSummary?.totalFiles ?? 0}**, edges: **${graph.importGraphSummary?.totalEdges ?? 0}**.
- Alias rules detected: ${Array.isArray(graph.importGraphSummary?.aliasRules) ? graph.importGraphSummary.aliasRules.join(", ") || "(none)" : "(n/a)"}.
- Entry files present: ${(graph.importGraphSummary?.entryFilesPresent || []).join(", ") || "(none)"}.

## Findings Matrix (Top Priorities)
| Area | Status | Evidence |
|------|:-----:|----------|
${matrix.map(([area, ok, ev]) => `| ${area} | ${statusEmoji(ok)} | ${ev} |`).join("\n")}

## Dead Code Candidates (first 25)
${topDead.length ? topDead.map(f => `- \`${f}\``).join("\n") : "_None detected by static graph (after alias/glob handling)._"}
${graph.deadFiles?.length > 25 ? `\n…and ${graph.deadFiles.length - 25} more` : ""}

## Case Conflicts (same directory, case-insensitive basename)
${(graph.caseConflicts || []).length ? graph.caseConflicts.map(group => `- ${group.map(x => `\`${x}\``).join(", ")}`).join("\n") : "_No conflicts detected._"}

## Stray fetch() to /api/* or Cloud Functions (first 25)
${topStray.length ? topStray.map(s => `- \`${s.file}:${s.line}\` — ${s.snippet}${s.alsoUsesUnified ? " _(file also imports unified client)_" : ""}`).join("\n") : "_None detected._"}
${(graph.strayFetchCalls || []).length > 25 ? `\n…and ${(graph.strayFetchCalls || []).length - 25} more` : ""}

## TypeScript Typecheck (best-effort)
\`\`\`
${tc.out.trim().slice(0, 4000)}
\`\`\`

## Recommended Next PR (Preview)
- Enforce **/api** rewrites and **no-store** index if missing.
- Ensure **App Check SOFT** wrappers at the top of HTTP handlers; keep client App Check init.
- Remove dead files above after verifying they aren’t loaded via router or dynamic glob.
  - Replace stray \`fetch()\` calls with \`apiFetchWithFallback\`.
- Confirm demo gating: signed‑in users are never blocked; admin shows **Unlimited** claims.
- Keep secrets in **Secret Manager** only.

---

_Artifacts:_  
- JSON graph: \`reports/import-graph.json\`  
- This report: **(you are reading it)**
`;

const reportPath = path.join(reportsDir, `REPORT_MyBodyScan_Audit_${ts}.md`);
fs.writeFileSync(reportPath, md);
console.log(reportPath);
