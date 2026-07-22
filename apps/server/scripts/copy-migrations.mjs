// tsc only emits compiled .ts -> .js/.d.ts; it doesn't copy the .sql
// migration files that migration-runner.ts/db-factory.ts read at runtime
// (relative to the compiled file's own directory, via import.meta.url --
// see db-factory.ts's DEFAULT_MAIN_MIGRATIONS_DIR). This copies each
// migrations* directory from src/db into the equivalent dist/db location
// after every build so the compiled output is runnable standalone.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDbDir = join(__dirname, "..", "src", "db");
const distDbDir = join(__dirname, "..", "dist", "db");

const migrationDirs = ["migrations", "migrations-log", "migrations-cache"];

for (const dir of migrationDirs) {
  const from = join(srcDbDir, dir);
  const to = join(distDbDir, dir);

  if (!existsSync(from)) {
    continue;
  }

  cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith(".test.ts") });
  console.log(`Copied ${from} -> ${to}`);
}
