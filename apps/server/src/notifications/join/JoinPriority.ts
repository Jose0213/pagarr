/** Ported from NzbDrone.Core/Notifications/Join/JoinPriority.cs. */
export enum JoinPriority {
  Silent = -2,
  Quiet = -1,
  Normal = 0,
  High = 1,
  Emergency = 2,
}
