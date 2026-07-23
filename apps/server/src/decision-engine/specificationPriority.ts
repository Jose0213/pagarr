/**
 * Ported from NzbDrone.Core/DecisionEngine/SpecificationPriority.cs.
 *
 * C# declares `Parsing`/`Database` as additional names for value 0 (the same
 * enum member can have multiple names in C# when the values collide) --
 * TypeScript enums allow the same value-collision, so `Default`/`Parsing`/
 * `Database` are all literally `0`, matching the original exactly.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values -- intentional, see file header: Default/Parsing/Database really are all 0 in the real C# enum. */
export enum SpecificationPriority {
  Default = 0,
  Parsing = 0,
  Database = 0,
  Disk = 1,
}
/* eslint-enable @typescript-eslint/no-duplicate-enum-values */
