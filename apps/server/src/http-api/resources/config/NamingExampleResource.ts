/**
 * Ported from Readarr.Api.V1/Config/NamingExampleResource.cs. Not a
 * `RestResource` (no `id` field in the real C# class) -- the anonymous
 * preview payload `NamingConfigController`'s `GET .../examples` route
 * returns. See NamingConfigResource.ts for the route wiring
 * (`namingConfigController()`'s `GET /examples` handler).
 */
export interface NamingExampleResource {
  singleBookExample: string | null;
  multiPartBookExample: string | null;
  authorFolderExample: string | null;
}
