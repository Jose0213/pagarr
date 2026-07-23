/** Ported from NzbDrone.Core/Notifications/Signal/SignalPayload.cs. */
export interface SignalPayload {
  message: string;
  number: string;
  recipients: string[];
}
