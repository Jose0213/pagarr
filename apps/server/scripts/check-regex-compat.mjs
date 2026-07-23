// Catches the exact class of bug that has broken CI twice already (see git
// log: "Fix CI: split PartOrSetRegex to avoid duplicate named capture
// groups", and the Phase 2 fix to TorrentRssParser.ts's seeder/leecher/peer
// regexes -- the second one slipped through this script's first version
// because it only scanned `/literal/` syntax and skipped test files, while
// the actual failing pattern was built via `new RegExp("string", flags)`
// and only threw at module-import time, which vitest attributed to
// whichever test file happened to trigger that import chain first).
//
// .NET allows the same named capture group to repeat across disjoint `|`
// alternation branches; JS only gained that (duplicate named capture
// groups) in a recent V8 change that isn't present on the Node version this
// project's CI pins to. A regex ported 1:1 from C# can compile fine on a
// newer local Node and still throw `SyntaxError: Duplicate capture group
// name` in CI -- tsc and vitest on a newer local Node won't catch it.
//
// Parses each file (source AND test files -- a bad regex can live in either
// and still break the build) with TypeScript's real parser and walks the
// AST for two constructs:
//   1. RegularExpressionLiteral nodes (`/pattern/flags` syntax). A bare
//      lexer/scanner can't reliably tell `/regex/` from division (`/` is
//      ambiguous without grammar context -- see this script's git history
//      for the first two attempts that got this wrong: a hand-rolled
//      regex-matches-regex heuristic that false-positived on JSDoc
//      comments, then a raw scanner loop that misread every division as
//      the start of a regex). The parser resolves that ambiguity
//      correctly, so this only ever flags real regex literals.
//   2. `new RegExp(patternArg, flagsArg)` calls where patternArg is a
//      statically-known string (a string literal, or simple string
//      concatenation of literals -- NOT a runtime-computed pattern like
//      user config or a variable built from external input, which this
//      script can't evaluate and correctly leaves unchecked).
// Run in CI on the same pinned Node version as the rest of the pipeline so
// it actually catches the boundary, not just "does this Node accept it."
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const files = globSync("src/**/*.ts", { cwd: process.cwd() });

let failures = 0;
let scanned = 0;

/** Evaluates a statically-known string expression (literal, or `+`-concatenation of literals). Returns null if not statically known. */
function staticStringValue(node) {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStringValue(node.left);
    const right = staticStringValue(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
}

for (const file of files) {
  const fullPath = join(process.cwd(), file);
  const sourceText = readFileSync(fullPath, "utf8");
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

  const check = (pattern, flags, node, label) => {
    scanned++;
    try {
      new RegExp(pattern, flags);
    } catch (err) {
      failures++;
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      console.error(`${file}:${line + 1}: ${err.message}`);
      console.error(`  ${label}`);
    }
  };

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = node.getText(sourceFile);
      const lastSlash = text.lastIndexOf("/");
      check(text.slice(1, lastSlash), text.slice(lastSlash + 1), node, text);
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RegExp" &&
      node.arguments &&
      node.arguments.length >= 1
    ) {
      const pattern = staticStringValue(node.arguments[0]);
      if (pattern !== null) {
        const flags = node.arguments[1] ? (staticStringValue(node.arguments[1]) ?? "") : "";
        check(pattern, flags, node, node.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

console.log(
  `Checked ${scanned} regex literals/constructors across ${files.length} files (Node ${process.version}).`
);

if (failures > 0) {
  console.error(`${failures} regex pattern(s) fail to compile on this Node version.`);
  process.exit(1);
}
