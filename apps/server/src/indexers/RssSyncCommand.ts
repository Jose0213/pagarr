/**
 * Ported from NzbDrone.Core/Indexers/RssSyncCommand.cs.
 *
 * C#'s `RssSyncCommand : Command` is a marker dispatched through the
 * `Messaging.Commands` command-bus (not yet ported -- see
 * tags/tagsUpdatedEvent.ts's doc comment for the same Messaging-deferral
 * precedent this follows). Kept as a marker class for shape-fidelity;
 * `SendUpdatesToClient`/`IsLongRunning` are command-bus/SignalR UI hints
 * with no equivalent here, omitted for the same reason
 * config/resetApiKeyCommand.ts omits them.
 */
export class RssSyncCommand {}
