import { writeFileSync, unlinkSync } from "node:fs";

/** Own only files we create; never overwrite or delete an operator's env. */
export function createTemporaryEnv(file, contents) {
  try {
    writeFileSync(file, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(
        "Local Functions env already exists. Move it aside yourself before running emulator verification; it was not modified."
      );
    }
    throw error;
  }
  return () => {
    try {
      unlinkSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
}
