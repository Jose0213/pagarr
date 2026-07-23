// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.sql"],
  },
  js.configs.recommended,
  {
    // Plain Node scripts (this config file, migration-copy script, the
    // regex-compat checker) -- linted for JS correctness only, not
    // type-checked. They aren't part of apps/server's TS program and don't
    // need to be: they're standalone tooling, not application source.
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
      },
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        // apps/server's own tsconfig.json excludes tests (so `tsc build`
        // doesn't emit them to dist/) -- point ESLint at the sibling
        // tsconfig.eslint.json instead, which includes everything (src +
        // tests) so linting actually covers test files too.
        project: "./apps/server/tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // This project is a faithful, mechanical port of Readarr's C# source --
      // unused params/locals often exist because a C# method signature or
      // interface is being matched exactly, not because of sloppiness.
      // Prefix with `_` to signal "intentionally unused" instead of banning
      // it outright.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Two real production bugs so far (see PORT_PLAN.md and git history)
      // came from JS-vs-C# engine mismatches that plain `tsc` didn't catch
      // -- Node's node:sqlite flag boundary and JS's lack of duplicate
      // named-capture-group support until a recent V8 change. `no-explicit-any`
      // stays off (heavy interop with sqlite/HTTP/JSON at module boundaries
      // makes blanket `any` bans noisy without matching benefit here), but
      // floating-promise and misused-promise checks are worth the noise --
      // this codebase is event/callback-heavy (see books/events.ts,
      // custom-formats/events.ts) where a silently dropped promise is a real
      // bug class, not a style nit.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // A recurring, legitimate pattern across this port: an interface is
      // declared async because SOME implementations/call sites genuinely
      // need to await (e.g. IIndexerRequestGenerator -- async because
      // NewznabRequestGenerator awaits an HTTP capabilities call --  or
      // IProvideAuthorInfo -- async because most metadata providers hit a
      // network API), but a specific method or provider is a trivial
      // pass-through/unsupported-operation stub with nothing to await
      // (RssIndexerRequestGenerator.getRecentRequests, every
      // supportsBookSearch() override, Google Books'
      // getChangedAuthors()/getAuthorInfo() where that provider has no
      // matching endpoint). The interface shape has to win for callers to
      // stay uniform; scoped disables at every such site would be noisier
      // than turning this off codebase-wide, given every real instance
      // found so far (Phase 0-2) has been this exact shape, not a bug.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/__tests__/**"],
    rules: {
      // Test files intentionally exercise invalid/edge-case inputs (null
      // profiles, malformed regex input, etc.) -- being stricter here than
      // in source fights the tests' actual purpose.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // Vitest mock objects assign plain functions to interface method
      // slots (e.g. `{ get: vi.fn() }` satisfying a class's method
      // signature) -- unbound-method's "this could be wrong if detached"
      // warning doesn't apply to these, they're never called as `obj.get()`
      // with meaningful `this` semantics, just invoked directly by the code
      // under test.
      "@typescript-eslint/unbound-method": "off",
      // vitest's vi.fn(callback) widens the callback's inferred parameter
      // types to `any` in several common patterns (typed mock fields on an
      // object literal, mock.calls[n][m] inspection) that this rule family
      // can't see through -- a known ergonomic gap between vitest and
      // strict TS, not a real unsafe-data-flow bug. Source code (where this
      // stays "error") doesn't have this problem since it isn't built out
      // of mocks.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  eslintConfigPrettier
);
