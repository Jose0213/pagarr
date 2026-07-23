import type { QualityModel } from "../qualities/qualityModel.js";

/** Ported from NzbDrone.Core/Notifications/DownloadFailedMessage.cs. */
export interface DownloadFailedMessage {
  message: string;
  sourceTitle: string;
  quality: QualityModel | null;
  downloadClient: string | null;
  downloadId: string | null;
}

/** Ported from `DownloadFailedMessage.ToString()`. */
export function downloadFailedMessageToString(message: DownloadFailedMessage): string {
  return message.message;
}
