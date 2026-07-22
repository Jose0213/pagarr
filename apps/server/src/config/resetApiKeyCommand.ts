/**
 * Ported from NzbDrone.Core/Configuration/ResetApiKeyCommand.cs.
 *
 * In Readarr, `ResetApiKeyCommand : Command` is a marker object dispatched
 * through the `Messaging.Commands` command-bus (`IExecute<ResetApiKeyCommand>`
 * is implemented by `ConfigFileProvider.Execute(ResetApiKeyCommand)`, which
 * just regenerates and persists a new API key). The command-bus / messaging
 * pattern itself (NzbDrone.Core.Messaging.Commands) is out of scope for this
 * module -- Messaging is its own Phase-4 module -- so this is ported as a
 * plain function that performs the same behavior directly, rather than as a
 * dispatchable command object with no bus to dispatch it through yet.
 *
 * `SendUpdatesToClient => true` on the C# command has no equivalent here
 * (it is a SignalR/UI hint from the command-bus infrastructure); omitted as
 * part of the same Messaging-deferral.
 */

import type { ConfigFileProvider } from "./configFileProvider.js";

/**
 * Ported from `ConfigFileProvider.Execute(ResetApiKeyCommand message)`:
 * `SetValue("ApiKey", GenerateApiKey())`.
 *
 * Generates a fresh API key and persists it to the bootstrap config file,
 * returning the new key.
 */
export function resetApiKeyCommand(configFileProvider: ConfigFileProvider): string {
  return configFileProvider.resetApiKey();
}
