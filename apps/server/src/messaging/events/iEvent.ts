/**
 * Ported from NzbDrone.Common/Messaging/IEvent.cs (and IProcessMessage.cs /
 * IProcessMessage{Async}.cs, which live directly under
 * NzbDrone.Core/Messaging/ in the real source tree -- ported here as
 * `iProcessMessage.ts` for consistency with this directory layout).
 *
 * C#'s `IEvent : IProcessMessage` is a pure marker interface -- any class
 * implementing it can be published through `IEventAggregator.PublishEvent`.
 * TypeScript has no nominal marker-interface concept and an empty
 * `interface IEvent {}` trips `@typescript-eslint/no-empty-object-type`
 * (this port's eslint config enables `recommendedTypeChecked`), so `IEvent`
 * is instead a type alias for the widest "any object" shape -- it still
 * plays the same structural role as the C# marker (every event class
 * trivially satisfies it) without an empty-interface lint violation.
 */
export type IEvent = object;
