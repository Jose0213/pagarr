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

// Same problem, different runtime asset: localizationService.ts reads its
// bundled English dictionary (localization/Core/en.json) relative to its
// own compiled location via import.meta.url (same DEFAULT_EN_DICTIONARY_PATH
// pattern as db-factory.ts's migrations dirs above) -- tsc's resolveJsonModule
// only type-checks a .json import, it doesn't copy the file into dist, so
// this needs the same explicit copy step.
const srcLocalizationDir = join(__dirname, "..", "src", "localization", "Core");
const distLocalizationDir = join(__dirname, "..", "dist", "localization", "Core");

if (existsSync(srcLocalizationDir)) {
  cpSync(srcLocalizationDir, distLocalizationDir, { recursive: true });
  console.log(`Copied ${srcLocalizationDir} -> ${distLocalizationDir}`);
}
