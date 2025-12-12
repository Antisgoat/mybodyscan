import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const programsDir = join(__dirname, "..", "src", "content", "programs");

const errors = [];
let checkedFiles = 0;

for (const entry of readdirSync(programsDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) {
    continue;
  }

  const filePath = join(programsDir, entry.name);
  let parsed;

  try {
    const raw = readFileSync(filePath, "utf8");
    parsed = JSON.parse(raw);
  } catch (error) {
    errors.push(
      `${entry.name}: ${error instanceof Error ? error.message : String(error)}`
    );
    continue;
  }

  checkedFiles += 1;

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push(`${entry.name}: top-level JSON must be an object`);
    continue;
  }

  if (typeof parsed.id !== "string" || parsed.id.trim() === "") {
    errors.push(`${entry.name}: missing string "id"`);
  }

  if (typeof parsed.title !== "string" || parsed.title.trim() === "") {
    errors.push(`${entry.name}: missing string "title"`);
  }

  if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0) {
    errors.push(`${entry.name}: "weeks" must be a non-empty array`);
    continue;
  }

  for (let weekIndex = 0; weekIndex < parsed.weeks.length; weekIndex += 1) {
    const week = parsed.weeks[weekIndex];

    if (week === null || typeof week !== "object" || Array.isArray(week)) {
      errors.push(`${entry.name}: weeks[${weekIndex}] must be an object`);
      continue;
    }

    if (!Array.isArray(week.days) || week.days.length === 0) {
      errors.push(
        `${entry.name}: weeks[${weekIndex}].days must be a non-empty array`
      );
      continue;
    }

    for (let dayIndex = 0; dayIndex < week.days.length; dayIndex += 1) {
      const day = week.days[dayIndex];

      if (day === null || typeof day !== "object" || Array.isArray(day)) {
        errors.push(
          `${entry.name}: weeks[${weekIndex}].days[${dayIndex}] must be an object`
        );
        continue;
      }

      if (!Array.isArray(day.blocks) || day.blocks.length === 0) {
        errors.push(
          `${entry.name}: weeks[${weekIndex}].days[${dayIndex}].blocks must be a non-empty array`
        );
        continue;
      }

      for (
        let blockIndex = 0;
        blockIndex < day.blocks.length;
        blockIndex += 1
      ) {
        const block = day.blocks[blockIndex];

        if (
          block === null ||
          typeof block !== "object" ||
          Array.isArray(block)
        ) {
          errors.push(
            `${entry.name}: weeks[${weekIndex}].days[${dayIndex}].blocks[${blockIndex}] must be an object`
          );
          continue;
        }

        if (!Array.isArray(block.exercises) || block.exercises.length === 0) {
          errors.push(
            `${entry.name}: weeks[${weekIndex}].days[${dayIndex}].blocks[${blockIndex}].exercises must be a non-empty array`
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Program validation failed:");
  for (const message of errors) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${checkedFiles} program file${checkedFiles === 1 ? "" : "s"}.`
);
