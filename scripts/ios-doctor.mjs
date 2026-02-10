import { spawnSync } from "node:child_process";

const result = spawnSync("node", ["scripts/ensure-native-firebase-config.mjs", "--doctor"], {
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
