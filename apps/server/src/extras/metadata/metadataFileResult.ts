/** Ported from NzbDrone.Core/Extras/Metadata/Files/MetadataFileResult.cs. */
export class MetadataFileResult {
  constructor(
    public relativePath: string,
    public contents: string
  ) {}
}
