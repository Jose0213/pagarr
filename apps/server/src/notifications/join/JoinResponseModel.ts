/** Ported from NzbDrone.Core/Notifications/Join/JoinResponseModel.cs. Field names kept as the real API's lowercase JSON shape (not camelCased -- these are deserialized directly, matching the C# `bool success` etc property names verbatim). */
export interface JoinResponseModel {
  success: boolean;
  userAuthError: boolean;
  errorMessage: string | null;
  kind: string | null;
  etag: string | null;
}
