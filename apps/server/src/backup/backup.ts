/** Ported from NzbDrone.Core/Backup/Backup.cs. */
export interface Backup {
  name: string;
  type: BackupType;
  size: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  time: string;
}

/** Ported from NzbDrone.Core/Backup/BackupCommand.cs's `BackupType` enum. */
export enum BackupType {
  Scheduled = 0,
  Manual = 1,
  Update = 2,
}
