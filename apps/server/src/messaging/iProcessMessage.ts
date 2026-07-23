/**
 * Ported from NzbDrone.Core/Messaging/IProcessMessage.cs.
 *
 * C#'s `IProcessMessage`/`IProcessMessageAsync`/`IProcessMessage<TMessage>`/
 * `IProcessMessageAsync<TMessage>` are pure marker interfaces shared by both
 * `Commands.IExecute<TCommand>` and `Events.IHandle<TEvent>` (both extend
 * `IProcessMessage<TMessage>` in the C# source). Ported the same way
 * `events/iEvent.ts` ports `IEvent` -- type aliases for "any object" rather
 * than empty interfaces (which trip
 * `@typescript-eslint/no-empty-object-type` under this port's eslint
 * config). Not actually referenced by any code in this port (TypeScript's
 * structural typing means `IExecute<TCommand>`/`IHandle<TEvent>` don't need
 * a common marker supertype to be used polymorphically the way C#'s nominal
 * type system does), but kept for 1:1 file-shape fidelity with the source
 * tree per this project's port conventions.
 */
export type IProcessMessage = object;
export type IProcessMessageAsync = IProcessMessage;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- TMessage mirrors C#'s IProcessMessage<TMessage> generic parameter, kept for shape fidelity even though structural typing doesn't need it.
export type IProcessMessageTyped<TMessage> = IProcessMessage;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see IProcessMessageTyped above.
export type IProcessMessageAsyncTyped<TMessage> = IProcessMessageAsync;
