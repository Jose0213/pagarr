/**
 * Ported from NzbDrone.Core/Datastore/ModelBase.cs
 *
 * C# used an abstract base class with a single `Id` auto-increment property
 * shared by every entity. TypeScript has no useful equivalent of a common
 * base *class* for plain data shapes, so this is ported as an interface --
 * every model type extends `ModelBase` the same way the C# classes derived
 * from `ModelBase`.
 */
export interface ModelBase {
  id: number;
}
