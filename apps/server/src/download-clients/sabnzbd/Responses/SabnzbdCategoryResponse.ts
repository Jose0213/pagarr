/** Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Responses/SabnzbdCategoryResponse.cs. */
export interface SabnzbdCategoryResponse {
  categories: string[];
}

export function createSabnzbdCategoryResponse(
  overrides: Partial<SabnzbdCategoryResponse> = {}
): SabnzbdCategoryResponse {
  return { categories: [], ...overrides };
}
