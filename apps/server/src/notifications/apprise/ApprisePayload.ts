import type { AppriseNotificationType } from "./AppriseNotificationType.js";

/** Ported from NzbDrone.Core/Notifications/Apprise/ApprisePayload.cs. */
export interface ApprisePayload {
  urls?: string;
  title: string;
  body: string;
  type: AppriseNotificationType;
  tag?: string;
}
