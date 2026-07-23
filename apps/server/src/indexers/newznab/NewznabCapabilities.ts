/** Ported from NzbDrone.Core/Indexers/Newznab/NewznabCapabilities.cs. */
export interface NewznabCategory {
  id: number;
  name: string;
  description: string;
  subcategories: NewznabCategory[];
}

export interface NewznabCapabilities {
  defaultPageSize: number;
  maxPageSize: number;
  supportedSearchParameters: string[] | null;
  supportedTvSearchParameters: string[] | null;
  supportedBookSearchParameters: string[] | null;
  supportsAggregateIdSearch: boolean;
  categories: NewznabCategory[];
}

/** Ported from NewznabCapabilities's default ctor. */
export function createNewznabCapabilities(
  overrides: Partial<NewznabCapabilities> = {}
): NewznabCapabilities {
  return {
    defaultPageSize: 100,
    maxPageSize: 100,
    supportedSearchParameters: ["q"],
    // This should remain 'rid' for older newznab installs.
    supportedTvSearchParameters: ["q", "rid", "season", "ep"],
    supportedBookSearchParameters: ["q", "author", "title"],
    supportsAggregateIdSearch: false,
    categories: [],
    ...overrides,
  };
}
