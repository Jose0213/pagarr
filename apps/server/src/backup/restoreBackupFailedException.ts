import { NzbDroneClientException } from "../exceptions/NzbDroneClientException.js";

/**
 * Ported from NzbDrone.Core/Backup/RestoreBackupFailedException.cs. Extends
 * the REAL, already-merged `NzbDroneClientException` (exceptions/
 * NzbDroneClientException.ts) directly -- not a forward-ref, per this
 * module's task instructions that the real `exceptions/` module is
 * available to use as-is.
 */
export class RestoreBackupFailedException extends NzbDroneClientException {
  constructor(statusCode: number, message: string) {
    super(statusCode, message);
    this.name = "RestoreBackupFailedException";
    Object.setPrototypeOf(this, RestoreBackupFailedException.prototype);
  }
}
