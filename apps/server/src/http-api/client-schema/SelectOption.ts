/**
 * Ported from Readarr.Http/ClientSchema/SelectOption.cs.
 *
 * Re-exported from Field.ts (which declares it inline since `Field.selectOptions`
 * is typed directly against it and the two are always used together) --
 * this file exists as its own module purely for 1:1 file-path fidelity with
 * the real C# source tree's `SelectOption.cs`, per this task's file-mapping
 * list.
 */
export type { SelectOption } from "./Field.js";
