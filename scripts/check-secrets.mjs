import fs from "node:fs";
import { execFileSync } from "node:child_process";

// Report locations, never credential values. Public Firebase / Stripe SDK keys
// are deliberately not treated as secrets. This is a guard, not forensic proof.
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Stripe secret/restricted key", /\b(?:sk|rk)_live_[A-Za-z0-9]{24,}\b/],
  ["OpenAI secret key", /\bsk-proj-[A-Za-z0-9_-]{24,}\b/],
  [
    "GitHub credential",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  ],
  [
    "Google service account key",
    /"type"\s*:\s*"service_account"[\s\S]{0,1000}"private_key"\s*:/,
  ],
];
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const [kind, pattern] of patterns) {
    if (pattern.test(text)) findings.push(`${file}: possible ${kind}`);
  }
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Secret-pattern check passed for ${files.length} tracked files (values never printed).`
  );
}
