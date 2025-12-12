import fs from "fs";

export function ensureFixtures() {
  const dir = "tests/fixtures";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const base64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDgwODAwQEBAXEBkYFREcHiEfGh0dICQjJC4sKCorNzg3Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O//2wBDAQwMDhAQEB0RGh0eOycnOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O//wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/APH/AP/Z";
  ["front.jpg", "left.jpg", "right.jpg", "back.jpg"].forEach((f) => {
    const p = `${dir}/${f}`;
    if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(base64, "base64"));
  });
}
