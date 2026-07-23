/**
 * Ported from NzbDrone.Core/ThingiProvider/ConfigContractNotFoundException.cs.
 * C#'s `NzbDroneException` base (from NzbDrone.Common.Exceptions, a
 * printf-style-formatted-message Exception subclass) is narrowed to a plain
 * `Error` subclass here -- the base itself hasn't been ported and this is
 * the only place in scope that needs it.
 */
export class ConfigContractNotFoundException extends Error {
  constructor(contract: string) {
    super(`Couldn't find config contract ${contract}`);
    this.name = "ConfigContractNotFoundException";
  }
}
