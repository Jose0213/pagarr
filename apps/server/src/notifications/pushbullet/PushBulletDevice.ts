/** Ported from NzbDrone.Core/Notifications/PushBullet/PushBulletDevice.cs. `id` maps to the real API's `iden` field (`[JsonProperty(PropertyName = "Iden")]` in the C#). */
export interface PushBulletDevice {
  iden: string;
  nickname: string | null;
  manufacturer: string | null;
  model: string | null;
}

/** Ported from NzbDrone.Core/Notifications/PushBullet/PushBulletDevicesResponse.cs. */
export interface PushBulletDevicesResponse {
  devices: PushBulletDevice[];
}
