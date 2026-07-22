// Ported from NzbDrone.Common/Http/HttpFormData.cs

export interface HttpFormData {
  name?: string;
  fileName?: string;
  contentData: Uint8Array;
  contentType?: string;
}
