/** Ported from NzbDrone.Core/Notifications/Telegram/TelegramError.cs. */
export interface TelegramError {
  ok: boolean;
  error_code: number;
  description: string;
}
