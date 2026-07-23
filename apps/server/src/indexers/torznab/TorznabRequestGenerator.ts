import type { INewznabCapabilitiesProvider } from "../newznab/NewznabCapabilitiesProvider.js";
import { NewznabRequestGenerator } from "../newznab/NewznabRequestGenerator.js";

/** Ported from NzbDrone.Core/Indexers/Torznab/TorznabRequestGenerator.cs. */
export class TorznabRequestGenerator extends NewznabRequestGenerator {
  constructor(capabilitiesProvider: INewznabCapabilitiesProvider) {
    super(capabilitiesProvider);
  }

  protected override async supportsBookSearch(): Promise<boolean> {
    const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);

    return (
      capabilities.supportedBookSearchParameters !== null &&
      capabilities.supportedBookSearchParameters.includes("q") &&
      capabilities.supportedBookSearchParameters.includes("author") &&
      capabilities.supportedBookSearchParameters.includes("title")
    );
  }
}
