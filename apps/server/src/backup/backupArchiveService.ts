import AdmZip from "adm-zip";
import { basename } from "node:path";

/**
 * Forward-ref for the slice of NzbDrone.Common/Disk/IArchiveService.cs
 * `BackupService.cs` calls: `CreateZip`/`Extract`. Uses `adm-zip`, this
 * repo's established synchronous zip dependency (see
 * `media-files-tags/epub-tag/epubReader.ts`'s doc comment for the prior
 * precedent reading zips; this is the first module needing to WRITE one).
 */
export interface IBackupArchiveService {
  createZip(path: string, files: string[]): void;
  extract(path: string, destination: string): void;
}

export class BackupArchiveService implements IBackupArchiveService {
  /** Ported from `IArchiveService.CreateZip(string path, IEnumerable<string> files)`: adds each file to the zip root by its base filename (no subfolder nesting), matching `BackupService.Backup`'s flat `_backupTempFolder` layout. */
  createZip(path: string, files: string[]): void {
    const zip = new AdmZip();
    for (const file of files) {
      zip.addLocalFile(file);
    }
    zip.writeZip(path);
  }

  /** Ported from `IArchiveService.Extract(string path, string destination)`. */
  extract(path: string, destination: string): void {
    const zip = new AdmZip(path);
    zip.extractAllTo(destination, true);
  }
}

/** Re-exported for callers that only need to derive a zip entry's filename the way `CreateZip`'s per-file add does. */
export function zipEntryName(filePath: string): string {
  return basename(filePath);
}
