import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** Reads a fixture file (relative to __tests__/fixtures/) as UTF-8 text. Mirrors the C# test helper `ReadAllText`. */
export function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}
