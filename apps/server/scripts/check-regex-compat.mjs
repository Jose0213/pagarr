// Catches the exact class of bug that broke CI once already (see git log:
// "Fix CI: split PartOrSetRegex to avoid duplicate named capture groups").
// .NET allows the same named capture group to repeat across disjoint `|`
// alternation branches; JS only gained that (duplicate named capture
// groups) in a recent V8 change that isn't present on the Node version this
// project's CI pins to. A regex ported 1:1 from C# can compile fine on a
// newer local Node and still throw `SyntaxError: Duplicate capture group
// name` in CI -- tsc and vitest on a newer local Node won't catch it.
//
// Parses each file with TypeScript's real parser and walks the AST for
// RegularExpressionLiteral nodes. A bare lexer/scanner can't reliably tell
// `/regex/` from division (`/` is ambiguous without grammar context -- see
// this script's git history for the first two attempts that got this
// wrong: a hand-rolled regex-matches-regex heuristic that false-positived
// on JSDoc comments, then a raw scanner loop that misread every division
// as the start of a regex). The parser resolves that ambiguity correctly,
// so this only ever flags real regex literals. Run in CI on the same
// pinned Node version as the rest of the pipeline so it actually catches
// the boundary, not just "does this Node accept it."
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const files = globSync("src/**/*.ts", { cwd: process.cwd() }).filter(
  (f) => !f.endsWith(".test.ts") && !f.includes("__tests__")
);

let failures = 0;
let scanned = 0;

for (const file of files) {
  const fullPath = join(process.cwd(), file);
  const sourceText = readFileSync(fullPath, "utf8");
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = node.getText(sourceFile);
      const lastSlash = text.lastIndexOf("/");
      const pattern = text.slice(1, lastSlash);
      const flags = text.slice(lastSlash + 1);
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

      scanned++;
      try {
        new RegExp(pattern, flags);
      } catch (err) {
        failures++;
        console.error(`${file}:${line + 1}: ${err.message}`);
        console.error(`  ${text}`);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

console.log(
  `Checked ${scanned} regex literals across ${files.length} files (Node ${process.version}).`
);

if (failures > 0) {
  console.error(`${failures} regex literal(s) fail to compile on this Node version.`);
  process.exit(1);
}
