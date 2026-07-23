/**
 * Ported from VersOne.Epub.Schema/EpubMetadata*.cs (EpubMetadata,
 * EpubMetadataCreator, EpubMetadataContributor, EpubMetadataDate,
 * EpubMetadataIdentifier, EpubMetadataMeta).
 *
 * All six are plain C# POCOs (auto-property bags, no behavior) -- ported as
 * plain TS interfaces. Kept in one file since they're small and only ever
 * used together as `EpubMetadata`'s field types, mirroring how tightly
 * PackageReader.ts's `readMetadata` couples them.
 */

export interface EpubMetadataCreator {
  creator: string;
  fileAs: string | null;
  role: string | null;
}

export interface EpubMetadataContributor {
  contributor: string;
  fileAs: string | null;
  role: string | null;
}

export interface EpubMetadataDate {
  date: string;
  event: string | null;
}

export interface EpubMetadataIdentifier {
  id: string | null;
  scheme: string | null;
  identifier: string;
}

export interface EpubMetadataMeta {
  name: string | null;
  content: string | null;
  id: string | null;
  refines: string | null;
  property: string | null;
  scheme: string | null;
}

export interface EpubMetadata {
  titles: string[];
  creators: EpubMetadataCreator[];
  subjects: string[];
  description: string | null;
  publishers: string[];
  contributors: EpubMetadataContributor[];
  dates: EpubMetadataDate[];
  types: string[];
  formats: string[];
  identifiers: EpubMetadataIdentifier[];
  sources: string[];
  languages: string[];
  relations: string[];
  coverages: string[];
  rights: string[];
  metaItems: EpubMetadataMeta[];
}
