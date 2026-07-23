/**
 * Ported from NzbDrone.Core/Organizer/FileNameValidationService.cs.
 *
 * The real C# implementation is already a stub: the actual episode/season
 * number validation logic is commented out (`//TODO Add Validation for
 * TrackFilename`), so `ValidateTrackFilename` unconditionally returns
 * `null`. Ported as-is -- this is genuinely dead/no-op code in the real
 * source, not a simplification made by this port.
 */
export interface IFilenameValidationService {
  validateTrackFilename(): null;
}

export class FileNameValidationService implements IFilenameValidationService {
  validateTrackFilename(): null {
    return null;
  }
}
