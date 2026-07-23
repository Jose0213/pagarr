/** Ported from NzbDrone.Core/Notifications/Apprise/AppriseNotificationType.cs. Serializes as the `[EnumMember(Value = "...")]` string, not the C# member name -- see appriseNotificationTypeToApiValue() below. */
export enum AppriseNotificationType {
  Info = 0,
  Success = 1,
  Warning = 2,
  Failure = 3,
}

/** Ported from the `[EnumMember(Value = "...")]` attributes: the wire value sent to the Apprise API for each enum member. */
export function appriseNotificationTypeToApiValue(type: AppriseNotificationType): string {
  switch (type) {
    case AppriseNotificationType.Info:
      return "info";
    case AppriseNotificationType.Success:
      return "success";
    case AppriseNotificationType.Warning:
      return "warning";
    case AppriseNotificationType.Failure:
      return "failure";
    default:
      return "info";
  }
}
